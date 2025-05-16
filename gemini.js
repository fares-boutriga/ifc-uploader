// server.js
require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // To parse JSON request bodies
app.use(express.static('public')); // Serve static files from 'public' folder

// Initialize Google Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); // Or "gemini-1.5-flash" etc.

// Simple chat history (in-memory, will be lost on server restart)
// For a production app, you'd use a database.
let chatHistory = [
  // { role: "user", parts: [{ text: "Hello" }] },
  // { role: "model", parts: [{ text: "Hello there! How can I help you today?" }] },
];

// API endpoint to handle chat messages
app.post('/chat', async (req, res) => {
    const userInput = req.body.message;

    if (!userInput) {
        return res.status(400).json({ error: "Message is required" });
    }

    try {
        // Add user message to history
        chatHistory.push({ role: "user", parts: [{ text: userInput }] });

        // Create a chat session with existing history
        const chat = model.startChat({
            history: chatHistory.slice(0, -1), // Send all history except the current user input
            generationConfig: {
                maxOutputTokens: 200, // Adjust as needed
            },
        });

        const result = await chat.sendMessage(userInput);
        const response = await result.response;
        const aiResponseText = response.text();

        // Add AI response to history
        chatHistory.push({ role: "model", parts: [{ text: aiResponseText }] });

        // Keep history from getting too long (e.g., last 20 messages)
        if (chatHistory.length > 20) {
            chatHistory = chatHistory.slice(chatHistory.length - 20);
        }

        res.json({ reply: aiResponseText });

    } catch (error) {
        console.error("Error calling Gemini API:", error);
        if (error.message.includes('API key not valid')) {
            res.status(500).json({ error: "AI service error: Invalid API Key. Please check your server configuration." });
        } else if (error.message.includes('SAFETY')) {
            res.status(400).json({ error: "AI Response Blocked: The content may violate safety policies." });
        }
        else {
            res.status(500).json({ error: "Failed to get response from AI" });
        }
    }
});

// API endpoint to get current chat history (optional, for debugging or reloading chat)
app.get('/history', (req, res) => {
    res.json(chatHistory.map(msg => ({
        sender: msg.role === 'user' ? 'user' : 'ai',
        text: msg.parts[0].text
    })));
});


app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
    console.log('API Key Loaded:', process.env.GEMINI_API_KEY ? 'Yes' : 'No - CHECK .env FILE!');
});