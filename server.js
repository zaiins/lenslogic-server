const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please wait a minute and try again.' }
});

app.use('/analyze', limiter);

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

app.post('/analyze', async (req, res) => {
  const { imageBase64, mediaType } = req.body;

  if (!imageBase64 || !mediaType) {
    return res.status(400).json({ error: 'Missing imageBase64 or mediaType' });
  }

  if (!ALLOWED_TYPES.includes(mediaType)) {
    return res.status(400).json({ error: 'Invalid file type. Only JPEG, PNG, WEBP, and GIF are allowed.' });
  }

  const prompt = `You are a world-class photography coach — warm, encouraging, and specific. Analyze this photo and respond ONLY with a JSON object (no markdown, no backticks, no preamble).

Return this exact structure:
{
  "overall": <number 1-10>,
  "verdict": "<one punchy sentence about the photo overall>",
  "looks": <number 1-10>,
  "scenery": <number 1-10>,
  "angles": <number 1-10>,
  "summary": "<2-3 sentences: warm, honest overall impression. Frame everything as photography technique, never about physical appearance>",
  "tips": [
    "<specific actionable tip 1 — include exact measurements or directions where possible>",
    "<specific actionable tip 2>",
    "<specific actionable tip 3>",
    "<specific actionable tip 4>"
  ],
  "edits": [
    {"name": "Exposure", "value": "+0.7", "dir": "pos"},
    {"name": "Highlights", "value": "-18", "dir": "neg"},
    {"name": "Shadows", "value": "+12", "dir": "pos"},
    {"name": "Clarity", "value": "+8", "dir": "pos"},
    {"name": "Temperature", "value": "+200K", "dir": "pos"},
    {"name": "Saturation", "value": "+5", "dir": "pos"}
  ]
}

Scoring guide:
- "looks": Rate how flattering the lighting, pose, angle, and framing is for any people in the shot. If no people, score purely on subject presentation. Frame all feedback as photography technique.
- "scenery": Background quality, color harmony, depth, clutter, mood, environmental interest.
- "angles": Rule of thirds, leading lines, perspective, framing, headroom, camera angle.

Tips should be SPECIFIC: "Move 2 feet left", "Tilt camera 10° downward", "Shoot from hip height".
Edits should reflect what this specific photo actually needs.
Be encouraging — every photo has something working. Never be negative about how someone looks.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err.error?.message || 'Claude API error' });
    }

    const data = await response.json();
    const raw = data.content.map(b => b.text || '').join('');
    const clean = raw.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);
    res.json(result);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));
app.get('/privacy', (req, res) => res.sendFile(__dirname + '/privacy.html'));
app.get('/terms', (req, res) => res.sendFile(__dirname + '/terms.html'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`LensLogic server running on port ${PORT}`));
