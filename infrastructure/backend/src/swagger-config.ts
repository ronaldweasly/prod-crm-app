/**
 * Swagger/OpenAPI Configuration
 * Documents all backend API endpoints for self-discovery
 */

export const swaggerConfig = {
  openapi: '3.0.0',
  info: {
    title: 'Solar CRM API',
    version: '1.0.0',
    description: 'REST API for Solar Installation CRM management system',
    contact: {
      name: 'Solar CRM Team',
    },
  },
  servers: [
    {
      url: '/api',
      description: 'API Server',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT Bearer token',
      },
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'auth_token',
        description: 'HTTPOnly cookie with auth token',
      },
    },
    schemas: {
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          name: { type: 'string' },
          role: {
            type: 'string',
            enum: ['Admin', 'Sales Team', 'Engineer', 'Accountant'],
          },
          active: { type: 'boolean' },
        },
      },
      Client: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          phone: { type: 'string' },
          address: { type: 'string' },
          roof_type: { type: 'string' },
          system_size_kw: { type: 'number' },
          created_date: { type: 'string', format: 'date' },
          assigned_to: { type: 'string' },
          assigned_to_field: { type: 'string' },
        },
      },
      ApiResponse: {
        type: 'object',
        properties: {
          data: { type: 'object' },
          error: { type: 'string' },
          statusCode: { type: 'number' },
        },
      },
      PaginatedResponse: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: { type: 'object' },
          },
          pagination: {
            type: 'object',
            properties: {
              total: { type: 'number' },
              limit: { type: 'number' },
              offset: { type: 'number' },
              hasMore: { type: 'boolean' },
              pages: { type: 'number' },
            },
          },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }, { cookieAuth: [] }],
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check endpoint',
        description: 'Check server and database connectivity',
        security: [],
        responses: {
          200: {
            description: 'Server is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    timestamp: { type: 'string', format: 'date-time' },
                    uptime: { type: 'string' },
                    database: { type: 'string' },
                  },
                },
              },
            },
          },
          503: {
            description: 'Server is unhealthy',
          },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'Login with email and password',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 6 },
                },
                required: ['email', 'password'],
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Login successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    token: { type: 'string', description: 'JWT token (deprecated, use cookie)' },
                    user: { $ref: '#/components/schemas/User' },
                  },
                },
              },
            },
          },
          401: {
            description: 'Invalid credentials',
          },
          403: {
            description: 'Account is inactive',
          },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Authentication'],
        summary: 'Logout and clear auth cookie',
        responses: {
          200: {
            description: 'Logout successful',
          },
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Authentication'],
        summary: 'Get current user info',
        responses: {
          200: {
            description: 'Current user data',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    user: { $ref: '#/components/schemas/User' },
                  },
                },
              },
            },
          },
          401: {
            description: 'Not authenticated',
          },
        },
      },
    },
    '/clients': {
      get: {
        tags: ['Clients'],
        summary: 'List all clients (paginated)',
        parameters: [
          {
            name: 'limit',
            in: 'query',
            description: 'Items per page (max 100)',
            schema: { type: 'number', default: 20 },
          },
          {
            name: 'offset',
            in: 'query',
            description: 'Number of items to skip',
            schema: { type: 'number', default: 0 },
          },
        ],
        responses: {
          200: {
            description: 'List of clients',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PaginatedResponse' },
              },
            },
          },
        },
      },
      post: {
        tags: ['Clients'],
        summary: 'Create new client',
        description: 'Admin or Sales Team only',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Client' },
            },
          },
        },
        responses: {
          201: {
            description: 'Client created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Client' },
              },
            },
          },
          400: {
            description: 'Invalid input',
          },
          403: {
            description: 'Insufficient permissions',
          },
        },
      },
    },
    '/clients/{id}': {
      get: {
        tags: ['Clients'],
        summary: 'Get client with all related data',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: {
            description: 'Client data',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    client: { $ref: '#/components/schemas/Client' },
                    workflow: { type: 'object' },
                    survey: { type: 'object' },
                    quotation: { type: 'object' },
                    installation: { type: 'object' },
                    subsidy: { type: 'object' },
                    payment: { type: 'object' },
                    documents: { type: 'object' },
                  },
                },
              },
            },
          },
          404: {
            description: 'Client not found',
          },
        },
      },
      delete: {
        tags: ['Clients'],
        summary: 'Delete client and all related data',
        description: 'Admin only. Performs cascading delete in a transaction.',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: {
            description: 'Client deleted successfully',
          },
          404: {
            description: 'Client not found',
          },
          500: {
            description: 'Delete failed. Transaction rolled back.',
          },
        },
      },
    },
  },
};
