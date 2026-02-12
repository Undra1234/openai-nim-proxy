// server.js - OpenAI to OpenRouter API Proxy
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// OpenRouter API configuration
const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const APP_NAME = process.env.APP_NAME || 'OpenAI-OpenRouter-Proxy';
const APP_URL = process.env.APP_URL || 'https://github.com/yourusername/openai-openrouter-proxy';

// Model mapping - All routes to Pony Alpha
const MODEL_MAPPING = {
  'gpt-3.5-turbo': 'openrouter/aurora-alpha',
  'gpt-4': 'openrouter/aurora-alpha',
  'gpt-4-turbo': 'openrouter/aurora-alpha',
  'gpt-4o': 'openrouter/aurora-alpha',
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'OpenAI to OpenRouter Proxy',
    api_connected: !!OPENROUTER_API_KEY
  });
});

// List models endpoint (OpenAI compatible)
app.get('/v1/models', async (req, res) => {
  try {
    // Fetch available models from OpenRouter
    const response = await axios.get(`${OPENROUTER_API_BASE}/models`, {
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`
      }
    });
    
    // Transform to OpenAI format
    const models = response.data.data.map(model => ({
      id: model.id,
      object: 'model',
      created: Date.now(),
      owned_by: model.id.split('/')[0] || 'openrouter'
    }));
    
    res.json({
      object: 'list',
      data: models
    });
  } catch (error) {
    console.error('Error fetching models:', error.message);
    
    // Fallback to mapped models if API call fails
    const models = Object.keys(MODEL_MAPPING).map(model => ({
      id: model,
      object: 'model',
      created: Date.now(),
      owned_by: 'openrouter-proxy'
    }));
    
    res.json({
      object: 'list',
      data: models
    });
  }
});

// Chat completions endpoint (main proxy)
app.post('/v1/chat/completions', async (req, res) => {
  try {
    const { model, messages, temperature, max_tokens, stream, top_p, frequency_penalty, presence_penalty } = req.body;
    
    // Map model name if it exists in our mapping, otherwise use as-is
    const openRouterModel = MODEL_MAPPING[model] || model;
    
    // Transform OpenAI request to OpenRouter format
    const openRouterRequest = {
      model: openRouterModel,
      messages: messages,
      temperature: temperature,
      max_tokens: max_tokens,
      top_p: top_p,
      frequency_penalty: frequency_penalty,
      presence_penalty: presence_penalty,
      stream: stream || false
    };
    
    // Make request to OpenRouter API
    const response = await axios.post(
      `${OPENROUTER_API_BASE}/chat/completions`,
      openRouterRequest,
      {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': APP_URL,
          'X-Title': APP_NAME
        },
        responseType: stream ? 'stream' : 'json'
      }
    );
    
    if (stream) {
      // Handle streaming response
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      response.data.pipe(res);
      
      response.data.on('end', () => res.end());
      response.data.on('error', (err) => {
        console.error('Stream error:', err);
        res.end();
      });
    } else {
      // OpenRouter already returns OpenAI-compatible format
      const openaiResponse = {
        ...response.data,
        model: model
      };
      
      res.json(openaiResponse);
    }
    
  } catch (error) {
    console.error('Proxy error:', error.message);
    
    const errorMessage = error.response?.data?.error?.message || error.message || 'Internal server error';
    const errorCode = error.response?.data?.error?.code || error.response?.status || 500;
    
    res.status(error.response?.status || 500).json({
      error: {
        message: errorMessage,
        type: 'invalid_request_error',
        code: errorCode
      }
    });
  }
});

// Catch-all for unsupported endpoints
app.all('*', (req, res) => {
  res.status(404).json({
    error: {
      message: `Endpoint ${req.path} not found`,
      type: 'invalid_request_error',
      code: 404
    }
  });
});

app.listen(PORT, () => {
  console.log(`OpenAI to OpenRouter Proxy running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`API Key configured: ${!!OPENROUTER_API_KEY}`);
});
