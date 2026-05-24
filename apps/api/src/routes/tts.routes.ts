import { Router } from 'express';
import { synthesize, ttsSchema } from '../controllers/tts.controller';
import { validate } from '../middlewares/validator';
import { ttsRateLimiter } from '../middlewares/rate-limiter';

const router = Router();

router.post('/', ttsRateLimiter, validate(ttsSchema), synthesize);

export default router;
