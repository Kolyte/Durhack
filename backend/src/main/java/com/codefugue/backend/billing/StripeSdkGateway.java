package com.codefugue.backend.billing;

import com.codefugue.backend.account.AppUser;
import com.stripe.StripeClient;
import com.stripe.param.CustomerCreateParams;
import com.stripe.param.checkout.SessionCreateParams;
import org.springframework.stereotype.Component;

/** StripeGateway backed by the official stripe-java client. */
@Component
public class StripeSdkGateway implements StripeGateway {

    private final BillingSettings settings;
    private volatile StripeClient client;

    public StripeSdkGateway(BillingSettings settings) {
        this.settings = settings;
    }

    private StripeClient client() {
        if (client == null) client = new StripeClient(settings.secretKey());
        return client;
    }

    @Override
    public String createCustomer(AppUser user) throws Exception {
        CustomerCreateParams.Builder p = CustomerCreateParams.builder()
                .setName(user.name() != null ? user.name() : user.login())
                .putMetadata("sonyx_user_id", Long.toString(user.id()))
                .putMetadata("github_login", user.login());
        if (user.email() != null) p.setEmail(user.email());
        return client().v1().customers().create(p.build()).getId();
    }

    @Override
    public String createCheckoutSession(String customerId, String priceId, String successUrl, String cancelUrl,
                                        String clientReferenceId) throws Exception {
        SessionCreateParams params = SessionCreateParams.builder()
                .setMode(SessionCreateParams.Mode.SUBSCRIPTION)
                .setCustomer(customerId)
                .addLineItem(SessionCreateParams.LineItem.builder().setPrice(priceId).setQuantity(1L).build())
                .setSuccessUrl(successUrl)
                .setCancelUrl(cancelUrl)
                .setClientReferenceId(clientReferenceId)
                .setAllowPromotionCodes(true)
                .build();
        return client().v1().checkout().sessions().create(params).getUrl();
    }

    @Override
    public String createPaymentCheckout(String customerId, String productName, String description, long amount,
                                        String currency, String successUrl, String cancelUrl,
                                        java.util.Map<String, String> metadata) throws Exception {
        SessionCreateParams params = SessionCreateParams.builder()
                .setMode(SessionCreateParams.Mode.PAYMENT)
                .setCustomer(customerId)
                .addLineItem(SessionCreateParams.LineItem.builder()
                        .setQuantity(1L)
                        .setPriceData(SessionCreateParams.LineItem.PriceData.builder()
                                .setCurrency(currency)
                                .setUnitAmount(amount)
                                .setProductData(SessionCreateParams.LineItem.PriceData.ProductData.builder()
                                        .setName(productName)
                                        .setDescription(description)
                                        .build())
                                .build())
                        .build())
                .putAllMetadata(metadata)
                .setSuccessUrl(successUrl)
                .setCancelUrl(cancelUrl)
                .setAllowPromotionCodes(true)
                .build();
        return client().v1().checkout().sessions().create(params).getUrl();
    }

    @Override
    public String createPortalSession(String customerId, String returnUrl) throws Exception {
        var params = com.stripe.param.billingportal.SessionCreateParams.builder()
                .setCustomer(customerId)
                .setReturnUrl(returnUrl)
                .build();
        return client().v1().billingPortal().sessions().create(params).getUrl();
    }
}
