require("dotenv").config();
const express = require("express");
const cors = require("cors");

// ✅ Import from AWS SDK v3
const {
  PollyClient,
  DescribeVoicesCommand,
  SynthesizeSpeechCommand,
} = require("@aws-sdk/client-polly");

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// ✅ Initialize Polly client with credentials
const polly = new PollyClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Health check
app.get("/", (req, res) => {
  res.send("✅ Polly TTS API (v3) is running");
});

// Get available voices
app.get("/voices", async (req, res) => {
  try {
    const command = new DescribeVoicesCommand({});
    const data = await polly.send(command);
    const neuralVoices = data.Voices.filter((v) =>
      v.SupportedEngines.includes("neural")
    );
    res.json(neuralVoices);
  } catch (error) {
    console.error("Error fetching voices:", error);
    res.status(500).json({ error: "Failed to fetch voices" });
  }
});

// Text-to-speech endpoint
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
    const command = new SynthesizeSpeechCommand(params);
    const data = await polly.send(command);

    if (data.AudioStream) {
      const chunks = [];
      for await (const chunk of data.AudioStream) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      res.set({
        "Content-Type": "audio/mpeg",
        "Content-Disposition": 'inline; filename="speech.mp3"',
      });
      res.send(buffer);
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
