import { Router } from 'express';
import ttsRoutes from './tts.routes';
import voicesRoutes from './voices.routes';
import healthRoutes from './health.routes';

const router = Router();

router.use('/tts', ttsRoutes);
router.use('/voices', voicesRoutes);
router.use('/health', healthRoutes);

export default router;
