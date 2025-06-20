require("dotenv").config();

const express = require("express");
const AWS = require("aws-sdk");
const cors = require("cors");

const app = express();
const port = 3000;

// Enable CORS for frontend access
app.use(cors());
app.use(express.json());

// Optional: Health check route
app.get("/", (req, res) => {
  res.send("✅ Polly TTS API is running");
});

// Configure AWS Polly
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const polly = new AWS.Polly();

// Get available Polly voices
app.get("/voices", async (req, res) => {
  try {
    const data = await polly.describeVoices({}).promise();
    const neuralVoices = data.Voices.filter((v) =>
      v.SupportedEngines.includes("neural")
    );
    res.json(neuralVoices);
  } catch (error) {
    console.error("Error fetching voices:", error);
    res.status(500).json({ error: "Failed to fetch voices" });
  }
});

// Convert text to speech and return MP3 audio buffer
app.post("/speak", async (req, res) => {
  const { text, voiceId = "Joanna", format = "mp3", speed = 1.0 } = req.body;

  if (!text || text.trim().length === 0) {
    return res
      .status(400)
      .json({ error: "Text is required for speech synthesis" });
  }

  if (text.length > 3000) {
    return res
      .status(400)
      .json({ error: "Text exceeds AWS Polly 3000 character limit" });
  }

  // Convert speed multiplier (e.g. 1.2) to percentage string (e.g. "120%")
  const ratePercent = Math.max(0.5, Math.min(speed, 2.0)) * 100 + "%";

  const ssmlText = `<speak><prosody rate="${ratePercent}">${text}</prosody></speak>`;

  const params = {
    Text: ssmlText,
    VoiceId: voiceId,
    OutputFormat: format,
    TextType: "ssml",
    Engine: "neural",
  };

  try {
    const data = await polly.synthesizeSpeech(params).promise();

    if (data.AudioStream) {
      res.set({
        "Content-Type": "audio/mpeg",
        "Content-Disposition": 'inline; filename="speech.mp3"',
      });
      res.send(data.AudioStream);
    } else {
      res.status(500).json({ error: "Invalid audio stream received" });
    }
  } catch (error) {
    console.error("Polly error:", error.message || error);
    res.status(500).json({ error: "Failed to synthesize speech" });
  }
});

// Start server
app.listen(port, () => {
  console.log(`✅ Server running at http://localhost:${port}`);
});
