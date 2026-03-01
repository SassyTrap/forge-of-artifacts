import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import pkg from 'pg';
import { createCanvas, loadImage } from 'canvas';
import crypto from 'crypto';

const { Pool } = pkg;
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(express.static(__dirname));

// ==========================================
// DATABASE SETUP (PostgreSQL via pg pooling)
// ==========================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/forge_db',
    // Uncomment for Render or production requiring SSL:
    /* ssl: { rejectUnauthorized: false } */
});

// Initialize database table if it doesn't exist
const initDB = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS items (
                id SERIAL PRIMARY KEY,
                session_id VARCHAR(255) UNIQUE NOT NULL,
                image_url TEXT NOT NULL,
                name VARCHAR(255) NOT NULL,
                stars INTEGER NOT NULL,
                category VARCHAR(50) NOT NULL,
                item_type VARCHAR(50) NOT NULL,
                ability TEXT NOT NULL,
                description TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("Database initialized.");
    } catch (e) {
        console.error("Database initialization failed. Are you sure Postgres is running? Error:", e.message);
    }
};
initDB();

// ==========================================
// UTILS
// ==========================================
function generateSessionId() {
    return crypto.randomBytes(32).toString('hex');
}

// Convert white background to transparent using canvas
async function removeWhiteBackground(base64Data) {
    try {
        const img = await loadImage(base64Data);
        const canvas = createCanvas(img.width, img.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;

        // Iterate through pixels; if rgb is > 240 (mostly white), set alpha to 0.
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            if (r > 240 && g > 240 && b > 240) {
                // Set alpha to 0 (transparent)
                data[i + 3] = 0;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return canvas.toDataURL('image/png');
    } catch (e) {
        console.error("Canvas background removal failed:", e);
        return base64Data; // fallback to original if it fails
    }
}

// Ensure user gets a session cookie
app.use((req, res, next) => {
    if (!req.cookies.forge_session) {
        const sid = generateSessionId();
        res.cookie('forge_session', sid, { maxAge: 90000000000, httpOnly: true });
        req.forgeSessionId = sid;
    } else {
        req.forgeSessionId = req.cookies.forge_session;
    }
    next();
});


// ==========================================
// ENDPOINTS
// ==========================================
app.post('/api/forge', async (req, res) => {
    try {
        const sessionId = req.forgeSessionId;
        const { description, itemType } = req.body;

        if (!description || !itemType) {
            return res.status(400).json({ error: 'Missing description or itemType' });
        }

        // 1. One-item-per-user check!
        const existingCheck = await pool.query('SELECT id FROM items WHERE session_id = $1', [sessionId]);
        if (existingCheck.rows.length > 0) {
            return res.status(403).json({ error: 'You have already forged your one artifact!' });
        }

        // 2. Generate Image via OpenRouter
        console.log(`Forging item for session ${sessionId.substring(0, 8)}...`);
        const imagePrompt = `A high-quality 2D digital painting of a fantasy item: ${description}. 
The item is a SINGLE INANIMATE OBJECT ONLY. IT IS ABSOLUTELY NOT A CHARACTER, PERSON, CREATURE, OR ANIMAL.
It is drawn in the stylized, hand-painted, vibrant, detailed art style of World of Warcraft and League of Legends inventory icons.
The background MUST be a pure, solid white background (#FFFFFF). The aspect ratio must be strictly 1:1.`;

        const imageRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://forge-of-artifacts.onrender.com', // Will be your Render URL
                'X-Title': 'Forge of Artifacts'
            },
            body: JSON.stringify({
                model: process.env.MODEL || 'google/gemini-3.1-flash-image-preview',
                messages: [{ role: 'user', content: [{ type: 'text', text: imagePrompt }] }],
                modalities: ["image"]
            })
        });

        if (!imageRes.ok) throw new Error(`Image API error: ${imageRes.status}`);
        const imageData = await imageRes.json();

        let imageUrl = null;
        if (imageData.choices[0]?.message?.images?.length > 0) {
            imageUrl = imageData.choices[0].message.images[0].image_url?.url || imageData.choices[0].message.images[0].url;
        } else {
            // Fallback parsing
            const content = imageData.choices[0]?.message?.content;
            if (typeof content === 'string') {
                const match = content.match(/!\[.*?\]\((.*?)\)/);
                if (match && match[1]) imageUrl = match[1];
                else if (content.startsWith('data:image') || content.startsWith('http')) imageUrl = content;
            } else if (Array.isArray(content)) {
                for (const part of content) {
                    if (part.type === 'image_url') {
                        imageUrl = part.image_url?.url || part.url;
                        break;
                    }
                }
            }
        }
        if (!imageUrl) throw new Error('Could not parse image from API response.');

        // 3. Process image to be transparent
        const transparentImageUrl = await removeWhiteBackground(imageUrl);

        // 4. Generate Metadata
        const metaPrompt = `You are a game item designer for a fantasy RPG. Generate metadata for this item.
Description: "${description}"
Type: ${itemType} (offense = weapons/damage, support = healing/shields, summoning = conjures creatures)

Respond in EXACTLY this JSON format:
{
  "name": "Creative fantasy name (2-4 words)",
  "stars": 3,
  "category": "One word kind (Weapon, Potion, Scroll, Food, Gem, Armor, Trinket, Relic, Book, Ring)",
  "ability": "A very brief 1 sentence description (max 10 words) of what this does."
}`;

        const metaRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://forge-of-artifacts.onrender.com',
                'X-Title': 'Forge of Artifacts'
            },
            body: JSON.stringify({
                model: process.env.TEXT_MODEL || 'google/gemini-2.5-flash',
                messages: [{ role: 'user', content: metaPrompt }]
            })
        });

        let metadata = { name: 'Mysterious Item', stars: 3, category: 'Trinket', ability: 'Its power is unknown' };
        if (metaRes.ok) {
            const metaData = await metaRes.json();
            let text = metaData.choices[0]?.message?.content || '';
            text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
            try {
                metadata = JSON.parse(text);
                metadata.stars = Math.max(1, Math.min(5, parseInt(metadata.stars) || 3));
            } catch (e) {
                console.warn('Could not parse JSON metadata, using fallback.');
            }
        }

        // 5. Insert into DB!
        const insertQuery = `
            INSERT INTO items (session_id, image_url, name, stars, category, item_type, ability, description)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id, image_url, name, stars, category, item_type, ability, description, created_at;
        `;
        const values = [
            sessionId,
            transparentImageUrl, // Store the transparent one!
            metadata.name,
            metadata.stars,
            metadata.category,
            itemType,
            metadata.ability,
            description
        ];

        const result = await pool.query(insertQuery, values);
        res.json(result.rows[0]);

    } catch (e) {
        console.error(e);
        // Postgres unique constraint error
        if (e.code === '23505') {
            return res.status(403).json({ error: 'You have already forged your one artifact!' });
        }
        res.status(500).json({ error: e.message || 'Failed to craft artifact.' });
    }
});


// Endpoint to fetch all items with Dynamic Rarity Math
app.get('/api/inventory', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, image_url as "imageUrl", name, stars, category, item_type as "itemType", ability as description FROM items ORDER BY created_at ASC');
        const items = result.rows;

        if (items.length === 0) return res.json([]);

        // Rarity Math
        // Count category saturations
        const categoryCounts = {};
        for (const item of items) {
            categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
        }

        const totalItems = items.length;

        let sumPickRates = 0;

        // Calculate raw numbers
        items.forEach(item => {
            const genreCount = categoryCounts[item.category];
            // rarity formula: lower genre count = more rare. Higher total items = more rare. Higher stars = small multiplier for rarity.
            const rawRarityNumeric = (1 / genreCount) * Math.log2(totalItems + 1) * (1 + (item.stars * 0.05));
            item._rawRarity = rawRarityNumeric;

            const pickRateRaw = 1 / (totalItems * rawRarityNumeric);
            item._pickRateRaw = pickRateRaw;
            sumPickRates += pickRateRaw;
        });

        // Normalize pick rates and assign rarity labels
        items.forEach(item => {
            item.pickRate = ((item._pickRateRaw / sumPickRates) * 100).toFixed(2); // String percentage

            // Map highest numerical rarity to "Legendary", lowest to "Common"
            // We use simple static thresholds or dynamic sorting based on the pool.
            // For now, let's just create a dynamic bracket based on the current pool max/min.
            item.rarityLabel = getRarityLabel(item._rawRarity, totalItems, categoryCounts[item.category], item.stars);

            delete item._rawRarity;
            delete item._pickRateRaw;
        });

        res.json(items);
    } catch (e) {
        console.error("Fetch inventory error:", e);
        res.status(500).json({ error: "Could not fetch inventory" });
    }
});

function getRarityLabel(rawScore, totalItems, genreCount, stars) {
    if (totalItems <= 2) return "Common"; // Can't be rare if there are no items

    // Very simple dynamic bracketing based on genre saturation
    // The fewer in a genre relative to total, the rarer.
    const percentageOfPool = genreCount / totalItems;

    if (percentageOfPool <= 0.05 && stars >= 4) return "Legendary";
    if (percentageOfPool <= 0.15) return "Epic";
    if (percentageOfPool <= 0.3) return "Rare";
    if (percentageOfPool <= 0.5) return "Uncommon";
    return "Common";
}

// Endpoint to check if current user has forged
app.get('/api/me', async (req, res) => {
    try {
        const result = await pool.query('SELECT name FROM items WHERE session_id = $1 LIMIT 1', [req.forgeSessionId]);
        res.json({ hasForged: result.rows.length > 0 });
    } catch (e) {
        res.json({ hasForged: false });
    }
});

app.listen(PORT, () => {
    console.log(`Forge of Artifacts server running on port ${PORT}`);
});
