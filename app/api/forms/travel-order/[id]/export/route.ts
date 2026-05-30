import { NextResponse, type NextRequest } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import * as travelOrder from "@/lib/forms/travel-order";
import {
  exportTravelOrderToPdfBuffer,
  type TravelOrderLetterheadImage,
} from "@/lib/forms/travel-order-export";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { Failure } from "@/lib/one-of";
import { validatorUtilities } from "@/lib/validators";

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.verify([
    permission.TRAVEL_READ,
    permission.TRAVEL_WRITE,
    permission.TRAVEL_APPROVER,
  ], "or");
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const { id } = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid travel order ID.")
      .build();
  }

  const form = await req.formData();
  const header = await _readOptionalImage(form.get("header"));
  if (header instanceof NextResponse) return header;
  const footer = await _readOptionalImage(form.get("footer"));
  if (footer instanceof NextResponse) return footer;
  const approvedByName = _readOptionalText(form.get("approvedByName"));
  const approvedByPosition = _readOptionalText(form.get("approvedByPosition"));

  const item = await travelOrder.getById(id);
  if (item instanceof Failure) {
    return ApiResponseBuilder.createFromFailure(item).build();
  }

  const result = await exportTravelOrderToPdfBuffer(item.value, {
    header,
    footer,
    approvedBy: {
      name: approvedByName,
      position: approvedByPosition,
    },
  });
  if (result instanceof Failure) {
    return ApiResponseBuilder.createFromFailure(result).build();
  }

  const filename = `travel-order-${item.value.refNumber}.pdf`;
  return new NextResponse(new Uint8Array(result.value), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function _readOptionalText(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

async function _readOptionalImage(value: FormDataEntryValue | null): Promise<TravelOrderLetterheadImage | undefined | NextResponse> {
  if (!value) return undefined;
  if (!(value instanceof File) || value.size === 0) return undefined;
  if (value.size > MAX_IMAGE_BYTES) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Header and footer images must be 6MB or smaller.")
      .build();
  }

  const format = _formatFromMime(value.type);
  if (!format) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Header and footer images must be PNG or JPEG files.")
      .build();
  }

  return {
    data: new Uint8Array(await value.arrayBuffer()),
    format,
  };
}

function _formatFromMime(mime: string): TravelOrderLetterheadImage["format"] | null {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpeg";
  return null;
}
