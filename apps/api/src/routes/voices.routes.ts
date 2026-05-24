import { Router } from 'express';
import { listVoices } from '../controllers/voices.controller';

const router = Router();

router.get('/', listVoices);

export default router;
