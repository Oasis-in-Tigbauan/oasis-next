import type {NextRequest} from 'next/server';

import {session as auth, SessionCode} from '@/lib/auth';
import * as permission from '@/lib/db/permissions';
import {ApiResponseBuilder, StatusCodes} from '@/lib/http/composers';
import {tryParseJson} from '@/lib/http/RequestUtilities';
import * as obr from '@/lib/obr';
import {oneOf} from '@/lib/one-of';
import {validator, validatorUtilities} from '@/lib/validators';

const TAX_TYPES = ['vat-g', 'vat-s', 'nvat-g', 'nvat-s'] as const;

function isValidTaxType(value: unknown): value is (typeof TAX_TYPES)[number] {
  return typeof value === 'string' && (TAX_TYPES as readonly string[]).includes(value);
}

export async function GET() {
  const session = await auth.verify(
    [permission.OBR_DISBURSEMENT_CREATE, permission.OBR_DISBURSEMENT_ACCOUNTANT_APPROVE],
    'or',
  );
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const users = await obr.getAllDisbursementVouchers(session.user!);
  return oneOf(users).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function POST(req: NextRequest) {
  const session = await auth.verify([permission.OBR_DISBURSEMENT_CREATE]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const body = await tryParseJson(req);
  if (!body || typeof body !== 'object') {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'Invalid payload.',
    ).build();
  }

  if ('requestId' in body && validatorUtilities.isUuid(String(body.requestId))) {
    const obrBody = body as ObrLinkedDisbursementRequest;
    const validate = await validator.validate<ObrLinkedDisbursementRequest>(obrBody, {
      properties: {
        requestId: {type: 'string', formatter: 'uuid'},
        oneForAll: {type: 'boolean'},
        withCheque: {type: 'boolean'},
        particulars: {type: 'string', formatter: 'non-empty-string'},
        explanation: {type: 'string', formatter: 'non-empty-string'},
        grossAmount: {type: 'string', formatter: 'decimal'},
        taxType: {
          type: 'string',
          formatterFn: async (v) => {
            if (typeof v === 'undefined') return {ok: true};
            if (!isValidTaxType(v)) return {ok: false, error: 'Invalid tax type.'};
            return {ok: true};
          },
        },
        vatableAmount: {type: 'string', formatter: 'decimal'},
        items: {
          type: 'object',
          formatterFn: async (items) => {
            if (!Array.isArray(items)) {
              return {ok: false, error: 'Items must be an array.'};
            }
            for (let i = 0; i < items.length; i++) {
              if (!validatorUtilities.isUuid(items[i].requestItemId)) {
                return {ok: false, error: `Invalid request item ID at position ${i}.`};
              }
              if (!validatorUtilities.isNotEmpty(items[i].explanation)) {
                return {ok: false, error: `Explanation is required at position ${i}.`};
              }
              if (
                validatorUtilities.isExisty(items[i].taxType) &&
                !isValidTaxType(items[i].taxType)
              ) {
                return {ok: false, error: `Invalid tax type at position ${i}.`};
              }
              if (
                validatorUtilities.isExisty(items[i].vatableAmount) &&
                !validatorUtilities.isNumber(items[i].vatableAmount, false, false)
              ) {
                return {ok: false, error: `Invalid vatable amount at position ${i}.`};
              }
            }
            return {ok: true};
          },
        },
      },
      requiredProperties: ['requestId', 'oneForAll', 'items'],
      allowUnvalidatedProperties: false,
    });
    if (!validate.ok) {
      return ApiResponseBuilder.createError(
        StatusCodes.Status400BadRequest,
        validate.errors!,
      ).build();
    }

    if (obrBody.oneForAll) {
      if (!validatorUtilities.isNotEmpty(obrBody.particulars)) {
        return ApiResponseBuilder.createError(
          StatusCodes.Status400BadRequest,
          'Particulars are required.',
        ).build();
      }
      if (!validatorUtilities.isNotEmpty(obrBody.explanation)) {
        return ApiResponseBuilder.createError(
          StatusCodes.Status400BadRequest,
          'An explanation is required.',
        ).build();
      }
      if (!validatorUtilities.isNumber(obrBody.grossAmount, false, false)) {
        return ApiResponseBuilder.createError(
          StatusCodes.Status400BadRequest,
          'A valid gross amount is required.',
        ).build();
      }
    }

    const result = await obr.createDisbursement(
      obrBody.requestId,
      {
        oneForAll: obrBody.oneForAll,
        withCheque: obrBody.withCheque,
        particulars: obrBody.particulars,
        explanation: obrBody.explanation,
        grossAmount: obrBody.grossAmount,
        taxType: obrBody.taxType,
        vatableAmount: obrBody.vatableAmount,
        items: obrBody.items,
      },
      session.user!,
    );
    return oneOf(result).match(
      (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
      (e) => ApiResponseBuilder.createFromFailure(e).build(),
    );
  }

  const standaloneBody = body as StandaloneDisbursementRequest;
  const validate = await validator.validate<StandaloneDisbursementRequest>(standaloneBody, {
    properties: {
      payee: {type: 'string', formatter: 'non-empty-string'},
      officeAddress: {type: 'string', formatter: 'non-empty-string'},
      responsibilityCenterId: {type: 'string', formatter: 'uuid'},
      prNumber: {type: 'string', formatter: 'non-empty-string'},
      withCheque: {type: 'boolean'},
      items: {
        type: 'object',
        formatterFn: async (items) => {
          if (!Array.isArray(items) || items.length === 0) {
            return {ok: false, error: 'At least one disbursement line is required.'};
          }
          for (let i = 0; i < items.length; i++) {
            if (!validatorUtilities.isNotEmpty(items[i].particulars)) {
              return {ok: false, error: `Particulars are required at position ${i}.`};
            }
            if (!validatorUtilities.isNotEmpty(items[i].explanation)) {
              return {ok: false, error: `Explanation is required at position ${i}.`};
            }
            if (!validatorUtilities.isNumber(items[i].grossAmount, false, false)) {
              return {ok: false, error: `Invalid gross amount at position ${i}.`};
            }
            if (
              validatorUtilities.isExisty(items[i].taxType) &&
              !isValidTaxType(items[i].taxType)
            ) {
              return {ok: false, error: `Invalid tax type at position ${i}.`};
            }
            if (
              validatorUtilities.isExisty(items[i].vatableAmount) &&
              !validatorUtilities.isNumber(items[i].vatableAmount, false, false)
            ) {
              return {ok: false, error: `Invalid vatable amount at position ${i}.`};
            }
          }
          return {ok: true};
        },
      },
    },
    requiredProperties: ['payee', 'officeAddress', 'responsibilityCenterId', 'items'],
    allowUnvalidatedProperties: false,
  });
  if (!validate.ok) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      validate.errors!,
    ).build();
  }

  const result = await obr.createStandaloneDisbursement(
    {
      payee: standaloneBody.payee,
      officeAddress: standaloneBody.officeAddress,
      responsibilityCenterId: standaloneBody.responsibilityCenterId,
      withCheque: standaloneBody.withCheque,
      ...(validatorUtilities.isNotEmpty(standaloneBody.prNumber)
        ? {prNumber: standaloneBody.prNumber}
        : {}),
      items: standaloneBody.items,
    },
    session.user!,
  );
  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type ObrLinkedDisbursementRequest = {
  requestId: string;
  oneForAll: boolean;
  withCheque?: boolean;
  particulars?: string;
  explanation?: string;
  grossAmount?: string;
  taxType?: string;
  vatableAmount?: string;
  items: Array<{
    requestItemId: string;
    explanation: string;
    taxType?: string;
    vatableAmount?: string;
  }>;
};

type StandaloneDisbursementRequest = {
  payee: string;
  officeAddress: string;
  responsibilityCenterId: string;
  prNumber?: string;
  withCheque?: boolean;
  items: Array<{
    particulars: string;
    explanation: string;
    grossAmount: string;
    taxType?: string;
    vatableAmount?: string;
  }>;
};
