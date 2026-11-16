package com.codefugue.backend.billing;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;

/** Test helper: signs a webhook payload exactly like Stripe does (v1 = HMAC-SHA256(secret, "t.payload")). */
public final class StripeSignatures {

    private StripeSignatures() {
    }

    public static String sign(String secret, String payload, long t) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        String sig = HexFormat.of().formatHex(mac.doFinal((t + "." + payload).getBytes(StandardCharsets.UTF_8)));
        return "t=" + t + ",v1=" + sig;
    }
}
