// index.js
require("dotenv").config();
const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const app = express();

// Middleware cho route nhận webhook Shopify
app.use("/shopify-event", express.raw({ type: "application/json" }));

// Middleware JSON cho các route khác
app.use(express.json());

// Hàm băm SHA256
function hashSHA256(data) {
  return data ? crypto.createHash("sha256").update(data.toString().trim().toLowerCase()).digest("hex") : undefined;
}

// Hàm tạo user_data chuẩn theo Facebook CAPI
function buildUserData(payload) {
  return {
    em: payload.email ? hashSHA256(payload.email) : undefined,
    ph: payload.phone ? hashSHA256(payload.phone) : undefined,
    fn: payload.first_name ? hashSHA256(payload.first_name) : undefined,
    ln: payload.last_name ? hashSHA256(payload.last_name) : undefined,
    ge: payload.gender ? hashSHA256(payload.gender) : undefined,
    db: payload.birthdate ? hashSHA256(payload.birthdate) : undefined,
    ct: payload.city ? hashSHA256(payload.city) : undefined,
    st: payload.state ? hashSHA256(payload.state) : undefined,
    zp: payload.zip ? hashSHA256(payload.zip) : undefined,
    country: payload.country ? hashSHA256(payload.country) : undefined,
    external_id: payload.external_id ? hashSHA256(payload.external_id) : undefined,

    client_ip_address: payload.client_ip_address,
    client_user_agent: payload.client_user_agent,
    fbc: payload.fbc,
    fbp: payload.fbp,
    subscription_id: payload.subscription_id,
    fb_login_id: payload.fb_login_id,
    lead_id: payload.lead_id,
    anon_id: payload.anon_id,
    madid: payload.madid,
    page_id: payload.page_id,
    page_scoped_user_id: payload.page_scoped_user_id,
    ctwa_clid: payload.ctwa_clid,
    ig_account_id: payload.ig_account_id,
    ig_sid: payload.ig_sid,
  };
}

app.post("/shopify-event", async (req, res) => {
  const hmacHeader = req.headers["x-shopify-hmac-sha256"];
  const topic = req.headers["x-shopify-topic"];
  const rawBody = req.body;

  const generatedHash = crypto
    .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(rawBody, "utf8")
    .digest("base64");

  if (generatedHash !== hmacHeader) {
    return res.status(401).send("Webhook verification failed");
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    return res.status(400).send("Invalid JSON");
  }

  const email = payload.email || "";
  const value = parseFloat(payload.total_price || 0);
  const eventTime = Math.floor(Date.now() / 1000);
  const eventId = String(payload.id || Date.now());

  let fbEventName = null;
  if (topic === "orders/create") fbEventName = "Purchase";
  else if (topic === "checkouts/create") fbEventName = "InitiateCheckout";
  else if (topic === "carts/create") fbEventName = "AddToCart";
  else return res.status(200).send("Ignored event");

  const userData = buildUserData({
    email: payload.email,
    phone: payload.phone,
    first_name: payload.customer?.first_name,
    last_name: payload.customer?.last_name,
    city: payload.customer?.default_address?.city,
    state: payload.customer?.default_address?.province,
    zip: payload.customer?.default_address?.zip,
    country: payload.customer?.default_address?.country_code,
    external_id: payload.customer?.id,
    client_ip_address: req.ip,
    client_user_agent: req.headers["user-agent"]
  });

  const fbPayload = {
    test_event_code: "TEST25219",
    data: [
      {
        event_name: fbEventName,
        event_time: eventTime,
        event_id: eventId,
        user_data: userData,
        custom_data: {
          value: value,
          currency: "USD"
        },
        action_source: "website"
      }
    ]
  };

  try {
    const response = await axios.post(
      `https://graph.facebook.com/v19.0/${process.env.PIXEL_ID}/events?access_token=${process.env.ACCESS_TOKEN}`,
      fbPayload
    );
    console.log("✅ Facebook CAPI Success:", response.data);
    return res.status(200).send("Event sent to Facebook");
  } catch (err) {
    console.error("❌ Facebook CAPI Error:");
    if (err.response) {
      console.error("Status:", err.response.status);
      console.error("Data:", JSON.stringify(err.response.data, null, 2));
    } else {
      console.error("Error:", err.message);
    }
    console.error("Payload sent:", JSON.stringify(fbPayload, null, 2));
    return res.status(500).send("Facebook CAPI error");
  }
});

app.get("/", (req, res) => {
  res.status(200).send("✅ Server is alive");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
