import fs from 'fs/promises';
import path from 'path';

import Decimal from 'decimal.js';
import {count} from 'drizzle-orm';

import {saaobEntries, saaobEntryGroup, expenseClasses} from '@/lib/db/schema';
import type {MigratorFn} from '@/lib/db/types';

export const saaobEntriesMigration: MigratorFn = async (client, usr): Promise<void> => {
  console.log('Migrating SAAOB entries...');

  // Check if there are items. Skip if there are items.
  const [result] = await client.select({count: count()}).from(saaobEntries);
  if (Number(result.count) > 0) {
    console.log('-> Skipped due to saaob entries exists');
    return;
  }

  const tree = await read();

  // Build a lookup map from accountName -> expense class id for O(1) resolution per item
  const expenseRows = await client
    .select({id: expenseClasses.id, accountName: expenseClasses.accountName})
    .from(expenseClasses);
  const expenseByName = new Map(expenseRows.map((r) => [r.accountName.trim().toUpperCase(), r.id]));

  const insertNode = async (node: SaaobTree, parentGroupId: string | null): Promise<void> => {
    if (node.type === 0) {
      const [group] = await client
        .insert(saaobEntryGroup)
        .values({name: node.name, parentId: parentGroupId})
        .returning({id: saaobEntryGroup.id});

      for (const child of node.children) {
        await insertNode(child, group.id);
      }
    } else {
      if (!parentGroupId) return;

      const rawBudget = (node.annualBudget ?? '').trim().replace(/,/g, '');
      const annualBudget = rawBudget === '' || rawBudget === '-' ? '0' : rawBudget;
      const budgetCasted = new Decimal(annualBudget).toString();

      const expenseCodeId = expenseByName.get(node.name.trim().toUpperCase()) ?? null;

      await client.insert(saaobEntries).values({
        name: node.name,
        accountCode: node.accountCode || null,
        annualBudget: budgetCasted,
        refCode: node.refCode || null,
        parentId: parentGroupId,
        allotmentShouldCopyFromAppropriation: node.appropriation === node.allotment,
        expenseCodeId,
        authorId: usr.id,
      });
    }
  };

  for (const root of tree) {
    await insertNode(root, null);
  }
};

async function read(): Promise<SaaobTree[]> {
  const filePath = path.join(__dirname, './data/saaob.csv');
  const text = await fs.readFile(filePath, 'utf8');

  // Parse CSV
  const csvParsed: Array<string[]> = [];
  let row: string[] = [];
  let current = '';
  let insideQuote = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuote && nextChar === '"') {
        current += '"';
        i++;
      } else {
        insideQuote = !insideQuote;
      }
    } else if (char === ',' && !insideQuote) {
      row.push(current);
      current = '';
    } else if ((char === '\r' || char === '\n') && !insideQuote) {
      if (char === '\r' && nextChar === '\n') i++;
      row.push(current);
      if (row.length > 0) csvParsed.push(row);
      row = [];
      current = '';
    } else {
      current += char;
    }
  }
  if (current || row.length > 0) {
    row.push(current);
    csvParsed.push(row);
  }

  const tree: SaaobTree[] = [];
  let stack: Array<{node: SaaobTree; level: number; isWrapper: boolean}> = [];

  const startIdx = 259;
  const endIdx = 1610;

  const knownRoots = [
    'STATUTORY & CONTRACTUAL OBLIGATIONS',
    'GENERAL FUND (PER OFFICE)',
    'LOCAL ECONOMIC ENTERPRISE',
    'CONTINUING FUNDS',
  ];

  /**
   * Helper to determine the "Structural Level" of a row
   * If 0=root, 1=ColA + ColB (group), 2=ColB (Group), 3=ColC (Group), 4=ColD (Group), 5=Item
   *
   * Simplified based on the visual rules:
   * Roots = 0
   * ColB (Any) = 2
   * ColC (Any) = 3
   * ColD (No Budget) = 4
   * Item = 5;
   *
   * @param row
   */
  const getRowLevel = (row: string[]) => {
    if (!row || row.length < 5) return -1;

    const colA = (row[0] || '').trim();
    const colB = (row[1] || '').trim();
    const colC = (row[2] || '').trim();
    const colD = (row[3] || '').trim();

    // check for budget values to identify as items or as groups
    // in colD — check all financial columns (E through K) since some rows
    // (e.g. CONTINUING items) have zero Annual Budget but non-zero Supplemental/Appropriation
    const hasBudget = [4, 5, 6, 7, 8, 9, 10].some(
      (idx) => row[idx] && row[idx] !== '-' && row[idx].trim() !== '',
    );
    const rowText = [colA, colB, colC, colD].join(' ').toUpperCase();

    // check for roots
    for (const rootName of knownRoots) {
      if (rowText.includes(rootName)) return 0;
    }

    // Item
    if (colD && hasBudget) return 5;

    // Header in D (MOOE, etc)
    if (colD) return 4;

    // Header in C
    if (colC) return 3;

    // Header in B (regardless of Col A)
    if (colB) return 2;

    // Idk what happened
    return -1;
  };

  const getRowName = (row: string[], level: number) => {
    if (level === 0) {
      const rowText = row.slice(0, 4).join(' ').toUpperCase();
      return knownRoots.find((r) => rowText.includes(r)) || 'UNKNOWN ROOT';
    }
    if (level === 5 || level === 4) return row[3];
    if (level === 3) return row[2];
    if (level === 2) return row[1];
    return '';
  };

  for (let i = startIdx; i < endIdx && i < csvParsed.length; i++) {
    const row = csvParsed[i];
    if (!row || row.length < 2) continue;

    const level = getRowLevel(row);
    if (level === -1) continue;

    const name = getRowName(row, level);
    const upperName = name.toUpperCase();

    // The TOTAL item terminates the nearest group that likely matches its name
    // or simply terminates the current deepest group.
    if (upperName.includes('TOTAL')) {
      // Pop the top group
      //
      // This can be refined to look up stack for name match, but strict popping usually works for
      // valid trees
      if (stack.length > 1) stack.pop();
      continue;
    }

    const newNode: SaaobTree = {
      name,
      children: [],
      type: 0,
    };

    if (level === 0) {
      tree.push(newNode);
      stack = [{node: newNode, level: 0, isWrapper: false}];
      continue;
    }

    // Skip orphans
    if (stack.length === 0) continue;

    let isWrapper = false;
    if (level >= 2 && level <= 4 && i + 1 < csvParsed.length) {
      const nextRow = csvParsed[i + 1];
      const nextLevel = getRowLevel(nextRow);

      // if next is the same level, current is a wrapper.
      // exception: don't wrap if next is a TOTAL (unlikely sequence, but safe to check)
      if (nextLevel === level && !getRowName(nextRow, nextLevel).toUpperCase().includes('TOTAL')) {
        isWrapper = true;
      }
    }

    if (level < 5) {
      newNode.type = 0;
    }

    if (level === 5) {
      newNode.type = 1;
      newNode.refCode = row[0] || ''; // Col A
      newNode.accountCode = row[4] || ''; // Col E
      newNode.annualBudget = row[5] || ''; // Col F
      newNode.supplemental = row[6] || ''; // Col G
      newNode.appropriation = row[7] || ''; // Col H
      newNode.allotment = row[8] || ''; // Col I
      newNode.obligation = row[9] || ''; // Col J
      newNode.unobligated = row[10] || ''; // Col K
      newNode.percentage = row[11] || ''; // Col L

      stack[stack.length - 1].node.children.push(newNode);
    } else {
      // Determine where to place in stack
      // We want to find the correct parent in the stack
      // If parent.level < current.level (standard nesting: L2 is inside L1)
      // If parent.isWrapper is true and parent.level === current.level (wrapper nesting L2 inside L2)
      while (stack.length > 1) {
        const parent = stack[stack.length - 1];

        const isStandardParent = parent.level < level;
        const isWrapperParent = parent.isWrapper && parent.level === level;

        if (isStandardParent || isWrapperParent) {
          break;
        } else {
          stack.pop();
        }
      }

      // Add to the found parent
      stack[stack.length - 1].node.children.push(newNode);

      // Push self to stack
      stack.push({node: newNode, level: level, isWrapper: isWrapper});
    }
  }

  return tree;
}

type SaaobTree = {
  name: string;
  children: SaaobTree[];
  type: 0 | 1;

  // Other information
  refCode?: string;
  accountCode?: string;
  annualBudget?: string;
  supplemental?: string;
  appropriation?: string;
  allotment?: string;
  obligation?: string;
  unobligated?: string;
  percentage?: string;
};
