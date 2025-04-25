require("dotenv").config();
const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

app.post("/purchase", async (req, res) => {
  const { event_id, email, value } = req.body;

  try {
    const response = await axios.post(
      `https://graph.facebook.com/v19.0/${process.env.PIXEL_ID}/events?access_token=${process.env.ACCESS_TOKEN}`,
      {
        data: [
          {
            event_name: "Purchase",
            event_time: Math.floor(Date.now() / 1000),
            event_id: event_id,
            user_data: {
              em: [hashSHA256(email)]
            },
            custom_data: {
              value: value,
              currency: "USD"
            }
          }
        ]
      }
    );

    res.json({ success: true, fb_response: response.data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

function hashSHA256(data) {
  return require("crypto").createHash("sha256").update(data).digest("hex");
}

app.listen(3000, () => console.log("Server running on port 3000"));
