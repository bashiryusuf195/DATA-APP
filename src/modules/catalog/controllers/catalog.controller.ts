import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { AppError } from "../../../shared/errors/AppError";
import {
  getActiveServices,
  getActivePlansForType,
} from "../services/catalog.service";

const VALID_SERVICE_TYPES = [
  "airtime",
  "data",
  "electricity",
  "cable_tv",
  "exam_pin",
  "identity_verification",
] as const;

const ServiceTypeParam = z.enum(VALID_SERVICE_TYPES);

const PlansQuerySchema = z.object({
  provider: z.string().min(1).optional(),
});

export async function listServicesController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const services = await getActiveServices();
    res.status(200).json({ success: true, data: services });
  } catch (err) {
    next(err);
  }
}

export async function listServicePlansController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const serviceTypeResult = ServiceTypeParam.safeParse(req.params.serviceType);

    if (!serviceTypeResult.success) {
      throw new AppError(
        400,
        "INVALID_SERVICE_TYPE",
        `Invalid service type. Valid types: ${VALID_SERVICE_TYPES.join(", ")}`
      );
    }

    const { provider } = PlansQuerySchema.parse(req.query);

    const plans = await getActivePlansForType(serviceTypeResult.data, provider);

    res.status(200).json({ success: true, data: plans });
  } catch (err) {
    next(err);
  }
}
