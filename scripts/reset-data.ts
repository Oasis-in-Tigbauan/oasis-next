import 'dotenv/config';
import {stdin as input, stdout as output} from 'node:process';
import {createInterface} from 'node:readline/promises';

import {db} from '@/lib/db';
import {
  appNotifications,
  aroOfficeDefinitions,
  aipReferences,
  esre,
  expenseClasses,
  expenseClassOfficeCodes,
  expenseType,
  fundTypes,
  lbacCollectionPerformanceData,
  lbacCollectionPerformanceGroup,
  lbacCollectionPerformanceMonthlyData,
  lbacGroups,
  lbacItems,
  lbacMonitoring,
  lbacQuarterlyReport,
  lbacStatementOfExpenditures,
  leaveApplications,
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
  officeCodes,
  payrollEntries,
  payrolls,
  ppmp,
  ppmpMajorGroup,
  ppmpMinorGroup,
  ppmpProjectGroup,
  purchasing,
  purchasingAip,
  saaobEntries,
  saaobEntryGroup,
  saaobStatisticItems,
  saaobStatisticSelectedGroups,
  saaobSummaryOfAccounts,
  saaobSummaryOfAccountsGroup,
  saaobSummaryOfAccountsLinkedGroups,
  supplemental,
  templateBucket,
  travelOrders,
} from '@/lib/db/schema';

async function askForConfirmation() {
  const readline = createInterface({input, output});

  try {
    const response = await readline.question(
      'This will permanently delete application data while preserving users, accounts, offices, and office positions. Type YES to continue: ',
    );

    if (response !== 'YES') {
      console.log('Reset aborted.');
      process.exit(0);
    }
  } finally {
    readline.close();
  }
}

async function resetData() {
  await askForConfirmation();

  console.log('Starting transactional reset...');

  await db.transaction(async (tx) => {
    // Break self-references before deleting the same tables.
    await tx.update(lbacGroups).set({parentId: null});
    await tx.update(saaobEntryGroup).set({parentId: null});
    await tx.update(saaobSummaryOfAccountsGroup).set({parentId: null});
    await tx.update(aipReferences).set({parentId: null});
    await tx.update(saaobStatisticItems).set({parentId: null});
    await tx.update(lbacCollectionPerformanceGroup).set({parentId: null});
    await tx.update(lbacStatementOfExpenditures).set({parentId: null});

    console.log('Deleting operational records...');
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
    await tx.delete(leaveApplications);
    await tx.delete(payrollEntries);
    await tx.delete(payrolls);
    await tx.delete(appNotifications);
    await tx.delete(saaobStatisticSelectedGroups);
    await tx.delete(lbacCollectionPerformanceMonthlyData);
    await tx.delete(lbacCollectionPerformanceData);
    await tx.delete(obrItems);
    await tx.delete(obrMainData);
    await tx.delete(ppmpMinorGroup);
    await tx.delete(saaobSummaryOfAccountsLinkedGroups);
    await tx.delete(obrDisbursementVouchers);
    await tx.delete(obrRequestItems);
    await tx.delete(lbacMonitoring);
    await tx.delete(lbacItems);
    await tx.delete(ppmpMajorGroup);
    await tx.delete(saaobSummaryOfAccounts);
    await tx.delete(supplemental);
    await tx.delete(obrRequests);

    console.log('Deleting planning and metadata records...');
    await tx.delete(lbacGroups);
    await tx.delete(lbacQuarterlyReport);
    await tx.delete(lbacCollectionPerformanceGroup);
    await tx.delete(lbacStatementOfExpenditures);
    await tx.delete(saaobStatisticItems);
    await tx.delete(saaobEntries);
    await tx.delete(saaobSummaryOfAccountsGroup);
    await tx.delete(purchasing);
    await tx.delete(saaobEntryGroup);
    await tx.delete(expenseClassOfficeCodes);
    await tx.delete(aipReferences);
    await tx.delete(aroOfficeDefinitions);
    await tx.delete(officeCodes);
    await tx.delete(expenseClasses);
    await tx.delete(fundTypes);
    await tx.delete(expenseType);
    await tx.delete(modeOfProcurements);
  });

  console.log('Data reset completed successfully.');
}

resetData().catch((error) => {
  console.error('Failed to reset data:', error);
  process.exit(1);
});
