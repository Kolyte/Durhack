package com.codefugue.backend.explain;

/** A failure with an HTTP status and a short, user-facing reason code. */
public class ExplainException extends RuntimeException {
    private final int status;
    private final String reason;

    public ExplainException(int status, String reason, String message) {
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
