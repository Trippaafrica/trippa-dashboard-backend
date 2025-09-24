import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

import { ApiLoggingInterceptor } from './utils/api-logging.interceptor';

async function bootstrap() {
    const logger = new Logger('Bootstrap');
    const app = await NestFactory.create(AppModule, {
        logger: ['log', 'error', 'warn', 'debug', 'verbose'],
    });
    app.setGlobalPrefix('api/v1');
    app.enableCors({
        origin: ['http://localhost:3000',
            'https://www.dashboard.trippaafrica.com',
            'www.dashboard.trippaafrica.com',
            'http://localhost:3001',
            'https://localhost:3000',
            'https://localhost:3001',
            'https://trippa-dashboard.netlify.app',
            'https://dashboard.trippaafrica.com',
        ],
        credentials: true,
    });
    app.useGlobalInterceptors(new ApiLoggingInterceptor());
    const port = process.env.PORT || 2000;
    await app.listen(port);
    logger.log(`Application is running on: http://localhost:${port}`);
}
bootstrap();
