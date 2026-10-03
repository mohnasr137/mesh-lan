import { Router } from "express";
import roomRoutes from "./roomRoutes.js";

const apiRouter = Router();

apiRouter.use("/rooms", roomRoutes);

export default apiRouter;
