import "dotenv/config";

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { db } from "@/lib/db";
import {
  aipReferences,
  esre,
  expenseClasses,
  expenseClassOfficeCodes,
  expenseType,
  fundTypes,
  lbacGroups,
  lbacItems,
  lbacQuarterlyReport,
  modeOfProcurements,
  obrDisbursementElectronic,
  obrDisbursementVouchers,
  obrItems,
  obrMainAipReferences,
  obrMainData,
  obrOfficeItem,
  obrRequestApprovers,
  obrRequestItems,
  obrRequests,
  ppmp,
  ppmpMajorGroup,
  ppmpMinorGroup,
  ppmpProjectGroup,
  purchasing,
  purchasingAip,
  saaobEntries,
  saaobEntryGroup,
  saaobSummaryOfAccounts,
  saaobSummaryOfAccountsGroup,
  saaobSummaryOfAccountsLinkedGroups,
  supplemental,
  templateBucket,
  travelOrders,
  officeCodes,
} from "@/lib/db/schema";

async function askForConfirmation() {
  const readline = createInterface({ input, output });

  try {
    const response = await readline.question(
      "This will permanently delete application data while preserving users, accounts, offices, and office positions. Type YES to continue: ",
    );

    if (response !== "YES") {
      console.log("Reset aborted.");
      process.exit(0);
    }
  } finally {
    readline.close();
  }
}

async function resetData() {
  await askForConfirmation();

  console.log("Starting transactional reset...");

  await db.transaction(async tx => {
    // Break self-references before deleting the same tables.
    await tx.update(lbacGroups).set({ parentId: null });
    await tx.update(saaobEntryGroup).set({ parentId: null });
    await tx.update(saaobSummaryOfAccountsGroup).set({ parentId: null });
    await tx.update(aipReferences).set({ parentId: null });

    console.log("Deleting operational records...");
    await tx.delete(obrMainAipReferences);
    await tx.delete(obrDisbursementElectronic);
    await tx.delete(purchasingAip);
    await tx.delete(ppmp);
    await tx.delete(ppmpProjectGroup);
    await tx.delete(obrOfficeItem);
    await tx.delete(obrRequestApprovers);
    await tx.delete(esre);
    await tx.delete(templateBucket);
    await tx.delete(travelOrders);
    await tx.delete(obrItems);
    await tx.delete(obrMainData);
    await tx.delete(ppmpMinorGroup);
    await tx.delete(saaobSummaryOfAccountsLinkedGroups);
    await tx.delete(obrDisbursementVouchers);
    await tx.delete(obrRequestItems);
    await tx.delete(lbacItems);
    await tx.delete(ppmpMajorGroup);
    await tx.delete(saaobSummaryOfAccounts);
    await tx.delete(supplemental);
    await tx.delete(obrRequests);

    console.log("Deleting planning and metadata records...");
    await tx.delete(lbacGroups);
    await tx.delete(lbacQuarterlyReport);
    await tx.delete(saaobEntries);
    await tx.delete(saaobSummaryOfAccountsGroup);
    await tx.delete(purchasing);
    await tx.delete(saaobEntryGroup);
    await tx.delete(expenseClassOfficeCodes);
    await tx.delete(aipReferences);
    await tx.delete(officeCodes);
    await tx.delete(expenseClasses);
    await tx.delete(fundTypes);
    await tx.delete(expenseType);
    await tx.delete(modeOfProcurements);
  });

  console.log("Data reset completed successfully.");
}

resetData().catch(error => {
  console.error("Failed to reset data:", error);
  process.exit(1);
});
