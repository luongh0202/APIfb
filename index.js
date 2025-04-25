require("dotenv").config();
const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const app = express();

// Route này xử lý webhook từ Shopify
app.use("/shopify-event", express.raw({ type: "application/json" }));

// Dùng cho tất cả route khác
app.use(express.json());

// Hàm hash email SHA256 theo yêu cầu Facebook CAPI
function hashSHA256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

// Route dùng để nhận các webhook từ Shopify
app.post("/shopify-event", async (req, res) => {
  const hmacHeader = req.headers["x-shopify-hmac-sha256"];
  const topic = req.headers["x-shopify-topic"];
  const rawBody = req.body;

  // Xác thực webhook từ Shopify
  const generatedHash = crypto
    .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(rawBody, "utf8")
    .digest("base64");

  if (generatedHash !== hmacHeader) {
    return res.status(401).send("Webhook verification failed");
  }

  // Parse body JSON
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    return res.status(400).send("Invalid JSON");
  }

  // Extract thông tin cần gửi
  const email = payload.email || "";
  const value = parseFloat(payload.total_price || 0);
  const eventTime = Math.floor(Date.now() / 1000);
  const eventId = String(payload.id || Date.now());

  // Mapping sự kiện
  let fbEventName = null;

  if (topic === "orders/create") {
    fbEventName = "Purchase";
  } else if (topic === "checkouts/create") {
    fbEventName = "InitiateCheckout";
  } else if (topic === "carts/create") {
    fbEventName = "AddToCart";
  } else {
    return res.status(200).send("Ignored event");
  }

  // Gửi về Facebook CAPI
  try {
    const response = await axios.post(
      `https://graph.facebook.com/v19.0/${process.env.PIXEL_ID}/events?access_token=${process.env.ACCESS_TOKEN}`,
      {
        data: [
          {
            event_name: fbEventName,
            event_time: eventTime,
            event_id: eventId,
            user_data: {
              em: [hashSHA256(email)]
            },
            custom_data: {
              value: value,
              currency: "USD"
            },
            action_source: "website"
          }
        ]
      }
    );

    return res.status(200).send("Event sent to Facebook");
  } catch (err) {
    console.error("Facebook CAPI Error:", err.message);
    return res.status(500).send("Facebook CAPI error");
  }
});

// Test API riêng nếu cần (không bắt buộc)
app.post("/purchase", async (req, res) => {
  const { email, value, event_id } = req.body;

  try {
    const response = await axios.post(
      `https://graph.facebook.com/v19.0/${process.env.PIXEL_ID}/events?access_token=${process.env.ACCESS_TOKEN}`,
      {
        data: [
          {
            event_name: "Purchase",
            event_time: Math.floor(Date.now() / 1000),
            event_id: event_id || "test_manual",
            user_data: {
              em: [hashSHA256(email)]
            },
            custom_data: {
              value: value,
              currency: "USD"
            },
            action_source: "website"
          }
        ]
      }
    );

    return res.status(200).json({ success: true, response: response.data });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

app.get("/", (req, res) => {
  res.status(200).send("✅ Server is alive");
});