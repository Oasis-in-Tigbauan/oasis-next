import {NextResponse, type NextRequest} from 'next/server';

import {session as auth, SessionCode} from '@/lib/auth';
import * as permission from '@/lib/db/permissions';
import * as travelOrder from '@/lib/forms/travel-order';
import {
  exportTravelOrderToPdfBuffer,
  type TravelOrderLetterheadImage,
} from '@/lib/forms/travel-order-export';
import {ApiResponseBuilder, StatusCodes} from '@/lib/http/composers';
import {tryReadFormData} from '@/lib/http/RequestUtilities';
import {unwrap} from '@/lib/one-of';
import {validatorUtilities} from '@/lib/validators';

export async function POST(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  const session = await auth.verify(
    [permission.TRAVEL_READ, permission.TRAVEL_WRITE, permission.TRAVEL_APPROVER],
    'or',
  );
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const {id} = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'Invalid travel order ID.',
    ).build();
  }

  // Read form data
  const form = await tryReadFormData(req);
  if (!form) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'Invalid form data.',
    ).build();
  }

  // Other data
  const headerObject = form.get('header');

  let header: TravelOrderLetterheadImage | undefined;
  if (validatorUtilities.isExisty(headerObject)) {
    const img = await validatorUtilities.tryReadImage(headerObject as File, {maxSize: 6291456});
    if (!img) {
      return ApiResponseBuilder.createError(
        StatusCodes.Status400BadRequest,
        'Invalid image.',
      ).build();
    }

    header = img;
  }

  const footerObject = form.get('footer');

  let footer: TravelOrderLetterheadImage | undefined;
  if (validatorUtilities.isExisty(footerObject)) {
    const img = await validatorUtilities.tryReadImage(footerObject as File, {maxSize: 6291456});
    if (!img) {
      return ApiResponseBuilder.createError(
        StatusCodes.Status400BadRequest,
        'Invalid image.',
      ).build();
    }
  }

  try {
    // Fetch the item and export the PDF
    const item = await unwrap(travelOrder.getById(id));
    const result = await unwrap(
      exportTravelOrderToPdfBuffer(item, {
        header,
        footer,
        approvedBy: {
          name: _readOptionalText(form.get('approvedByName')),
          position: _readOptionalText(form.get('approvedByPosition')),
        },
      }),
    );

    const filename = `travel-order-${item.refNumber}.pdf`;
    return new NextResponse(new Uint8Array(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch {
    // Notice that the exception is not captured here. It is already captured by the Failure
    // constructor. :)

    return ApiResponseBuilder.createError(
      StatusCodes.Status500InternalServerError,
      'Failed to retrieve travel order.',
    ).build();
  }
}

function _readOptionalText(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}
