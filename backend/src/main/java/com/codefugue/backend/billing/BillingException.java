package com.codefugue.backend.billing;

/** A billing failure with an HTTP status and a short reason code for the frontend. */
public class BillingException extends RuntimeException {
    private final int status;
    private final String reason;

    public BillingException(int status, String reason, String message) {
        super(message);
        this.status = status;
        this.reason = reason;
    }

    public int status() {
        return status;
    }

    public String reason() {
        return reason;
    }
}
