import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Saarthi Fund API',
      version: '1.0.0',
      description: 'Emergency loan fund management system API',
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Development server' }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
            role: { type: 'string', enum: ['admin', 'member'] },
            status: { type: 'string', enum: ['pending', 'active', 'inactive', 'rejected'] },
            joined_at: { type: 'string', format: 'date' }
          }
        },
        Deposit: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string', format: 'uuid' },
            amount: { type: 'number' },
            member_month: { type: 'integer' },
            deposit_date: { type: 'string', format: 'date' },
            cumulative_total: { type: 'number' }
          }
        },
        Loan: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string', format: 'uuid' },
            principal_amount: { type: 'number' },
            interest_rate: { type: 'number' },
            multiplier_at_disbursement: { type: 'number' },
            disbursed_at: { type: 'string', format: 'date' },
            emi_start_date: { type: 'string', format: 'date' },
            maturity_date: { type: 'string', format: 'date' },
            outstanding_principal: { type: 'number' },
            status: { type: 'string', enum: ['active', 'completed', 'defaulted'] }
          }
        },
        InterestBracket: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            min_multiplier: { type: 'number' },
            max_multiplier: { type: 'number' },
            interest_rate: { type: 'number' },
            is_active: { type: 'boolean' }
          }
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  },
  apis: ['./src/routes/*.ts']
};

export const swaggerSpec = swaggerJsdoc(options);
