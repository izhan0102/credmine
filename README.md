# CredMine

A decentralized web application that rewards users with Cred tokens for their time and knowledge. Complete quizzes and earn tokens that can be transferred between users.

## Features

- Quiz-based token rewards
- Time-based rewards system
- Secure token transfers via QR codes
- User wallet system
- Welcome bonus of 500 CRED tokens

## Tech Stack

- Node.js
- Express.js
- EJS Templates
- MongoDB (configured separately)

## Development

1. Clone the repository
```bash
git clone https://github.com/yourusername/credmine.git
cd credmine
```

2. Install dependencies
```bash
npm install
```

3. Start development server
```bash
npm run dev
```

## Deployment

This project is configured for deployment on Vercel:

1. Install Vercel CLI
```bash
npm i -g vercel
```

2. Deploy
```bash
vercel
```

## Environment Variables

Create a `.env` file in the root directory with:

```env
MONGODB_URI=your_mongodb_connection_string
SESSION_SECRET=your_session_secret
```

## Author

Muhammad Izhaan
- Email: muhammadizhan710@gmail.com 