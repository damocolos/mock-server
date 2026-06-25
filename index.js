const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json()); // To parse JSON request bodies

// --- Mock API Endpoints ---

// 1. Success Responses
app.get('/api/success', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Request was successful',
        data: {
            id: 1,
            name: 'Mock Item',
            description: 'This is a mock item from the success endpoint'
        }
    });
});

app.post('/api/created', (req, res) => {
    const receivedData = req.body;
    res.status(201).json({
        success: true,
        message: 'Resource created successfully',
        data: receivedData
    });
});

app.get('/api/no-content', (req, res) => {
    res.status(204).send(); // 204 No Content
});

// 2. Client Error Responses
app.get('/api/bad-request', (req, res) => {
    res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'The request could not be understood or was missing required parameters.'
    });
});

app.get('/api/unauthorized', (req, res) => {
    res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication is required and has failed or has not yet been provided.'
    });
});

app.get('/api/forbidden', (req, res) => {
    res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not have the necessary permissions to access this resource.'
    });
});

app.get('/api/not-found', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'The requested resource could not be found.'
    });
});

// 3. Server Error Responses
app.get('/api/server-error', (req, res) => {
    res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'An unexpected condition was encountered on the server.'
    });
});

app.get('/api/bad-gateway', (req, res) => {
    res.status(502).json({
        success: false,
        error: 'Bad Gateway',
        message: 'The server received an invalid response from the upstream server.'
    });
});

// 4. Utility / Dynamic Endpoints

// Dynamic status code endpoint
app.all('/api/status/:code', (req, res) => {
    const code = parseInt(req.params.code, 10);
    
    // Check if valid HTTP status code (rough check between 100 and 599)
    if (isNaN(code) || code < 100 || code >= 600) {
        return res.status(400).json({
            success: false,
            error: 'Invalid status code',
            message: 'Please provide a valid HTTP status code.'
        });
    }

    res.status(code).json({
        success: code >= 200 && code < 300,
        message: `Returned status code ${code}`
    });
});

// Delayed response endpoint (simulates slow network)
app.get('/api/delay/:ms', (req, res) => {
    const ms = parseInt(req.params.ms, 10) || 1000; // default 1 second
    
    setTimeout(() => {
        res.status(200).json({
            success: true,
            message: `Response delayed by ${ms} milliseconds.`
        });
    }, ms);
});

// Echo endpoint (returns back what was sent)
app.all('/api/echo', (req, res) => {
    res.status(200).json({
        method: req.method,
        headers: req.headers,
        body: req.body,
        query: req.query
    });
});

// Random failure endpoint (returns 500 randomly, e.g., 50% of the time)
app.get('/api/flaky', (req, res) => {
    const isSuccess = Math.random() > 0.5;
    
    if (isSuccess) {
        res.status(200).json({ success: true, message: 'Flaky request succeeded this time!' });
    } else {
        res.status(500).json({ success: false, error: 'Internal Server Error', message: 'Flaky request failed!' });
    }
});

// Fallback for any other route
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'API route not found. Check the URL.'
    });
});

// Start the server (only if not running on Vercel)
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Mock server is running on http://localhost:${PORT}`);
        console.log('Available endpoints:');
        console.log('  GET  /api/success');
        console.log('  POST /api/created');
        console.log('  GET  /api/no-content');
        console.log('  GET  /api/bad-request');
        console.log('  GET  /api/unauthorized');
        console.log('  GET  /api/forbidden');
        console.log('  GET  /api/not-found');
        console.log('  GET  /api/server-error');
        console.log('  GET  /api/bad-gateway');
        console.log('  ALL  /api/status/:code');
        console.log('  GET  /api/delay/:ms');
        console.log('  ALL  /api/echo');
        console.log('  GET  /api/flaky');
    });
}

// Export the Express API
module.exports = app;
