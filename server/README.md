Minimal Go email relay using SendGrid.

Environment
- `SENDGRID_API_KEY` - required SendGrid API key
- `PORT` - optional HTTP port (default 8080)

Run (development)
```bash
cd server
go run .
```

Request
POST /send-email
Content-Type: application/json

Body:
```json
{
  "to": "recipient@example.com",
  "from": "sender@example.com",
  "subject": "Hello",
  "message": "Body text"
}
```

The server returns SendGrid response details for debugging.
