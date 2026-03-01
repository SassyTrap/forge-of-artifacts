import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static frontend files (index.html, style.css, game.js)
app.use(express.static(__dirname));

// Simple in-memory storage for multiplayer items (resets on server restart)
const globalInventory = [];

app.post('/api/forge', async (req, res) => {
    try {
        const { description, itemType } = req.body;

        if (!description || !itemType) {
            return res.status(400).json({ error: 'Missing description or itemType' });
        }

        // 1. Generate Image
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
                messages: [{
                    role: 'user',
                    content: [{ type: 'text', text: imagePrompt }]
                }],
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

        // 2. Generate Metadata
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

        // Save to global multiplayer inventory
        const finalItem = {
            id: Date.now(),
            imageUrl,
            metadata,
            itemType,
            description
        };
        globalInventory.push(finalItem);

        res.json(finalItem);

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message || 'Failed to craft artifact.' });
    }
});

// Endpoint to fetch all items for multiplayer viewing
app.get('/api/inventory', (req, res) => {
    res.json(globalInventory);
});

app.listen(PORT, () => {
    console.log(`Forge of Artifacts server running on port ${PORT}`);
});
