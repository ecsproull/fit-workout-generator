package main

import (
    "encoding/json"
    "log"
    "net/http"
    "os"
    "time"

    "github.com/sendgrid/sendgrid-go"
    "github.com/sendgrid/sendgrid-go/helpers/mail"
)

type EmailRequest struct {
    To      string `json:"to"`
    From    string `json:"from"`
    Subject string `json:"subject"`
    Message string `json:"message"`
}

func sendEmailHandler(w http.ResponseWriter, r *http.Request) {
    if r.Method == http.MethodOptions {
        w.Header().Set("Access-Control-Allow-Origin", "*")
        w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
        w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
        w.WriteHeader(http.StatusNoContent)
        return
    }

    if r.Method != http.MethodPost {
        http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
        return
    }

    w.Header().Set("Access-Control-Allow-Origin", "*")
    w.Header().Set("Content-Type", "application/json")

    var req EmailRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "invalid request body", http.StatusBadRequest)
        return
    }

    apiKey := os.Getenv("SENDGRID_API_KEY")
    if apiKey == "" {
        http.Error(w, "sendgrid api key not configured", http.StatusInternalServerError)
        return
    }

    from := mail.NewEmail("", req.From)
    to := mail.NewEmail("", req.To)
    plainText := req.Message
    htmlContent := req.Message
    m := mail.NewSingleEmail(from, req.Subject, to, plainText, htmlContent)

    client := sendgrid.NewSendClient(apiKey)
    resp, err := client.Send(m)
    if err != nil {
        log.Println("sendgrid send error:", err)
        http.Error(w, "failed to send email", http.StatusInternalServerError)
        return
    }

    // Return status and body from SendGrid for debugging
    out := map[string]interface{}{
        "status":  resp.StatusCode,
        "body":    resp.Body,
        "headers": resp.Headers,
    }
    json.NewEncoder(w).Encode(out)
}

func main() {
    mux := http.NewServeMux()
    mux.HandleFunc("/send-email", sendEmailHandler)

    port := os.Getenv("PORT")
    if port == "" {
        port = "8080"
    }

    srv := &http.Server{
        Addr:         ":" + port,
        Handler:      mux,
        ReadTimeout:  10 * time.Second,
        WriteTimeout: 10 * time.Second,
        IdleTimeout:  30 * time.Second,
    }

    log.Printf("Server listening on %s", srv.Addr)
    log.Fatal(srv.ListenAndServe())
}
