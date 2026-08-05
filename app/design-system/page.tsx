import type {LucideIcon} from 'lucide-react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  CopyCheck,
  FileSpreadsheet,
  Info,
  Layers3,
  LockKeyhole,
  PhilippinePeso,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  UserCheck,
} from 'lucide-react';
import type {Metadata} from 'next';

import {Alert, AlertDescription, AlertTitle} from '@/components/ui/alert';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Checkbox} from '@/components/ui/checkbox';
import {Input} from '@/components/ui/input';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs';
import {oasisTokens} from '@/lib/tokens';
import {cn} from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Oasis Design System',
  description: 'Design tokens, component guidance, and implementation rules for Oasis-Next.',
};

const navItems = [
  'Tokens',
  'Guidelines',
  'Button',
  'Input',
  'Card',
  'Badge',
  'Alert',
  'Table',
  'Workflow',
  'Agent Rules',
];

const colorGroups = [
  {name: 'brand', tokens: oasisTokens.color.brand},
  {name: 'semantic', tokens: oasisTokens.color.semantic},
  {name: 'surface', tokens: oasisTokens.color.surface},
];

const statusBadges = [
  {label: 'Draft', className: 'border-slate-300 bg-slate-100 text-slate-700'},
  {label: 'Pending', className: 'border-[#FFB30F]/30 bg-[#FFF3D6] text-[#7A4B00]'},
  {label: 'Approved', className: 'border-emerald-200 bg-emerald-50 text-emerald-700'},
  {label: 'Returned', className: 'border-rose-200 bg-rose-50 text-rose-700'},
  {label: 'Posted', className: 'border-[#29639F]/20 bg-[#EAF2FA] text-[#1F4F80]'},
];

const componentRows = [
  [
    'Button',
    'Trigger actions',
    'default, secondary, outline, destructive, ghost',
    'default, hover, focus, disabled, loading',
  ],
  [
    'Input',
    'Receive text and numeric data',
    'text, decimal string, code, disabled',
    'default, focus, error, disabled',
  ],
  [
    'Card',
    'Group related data or actions',
    'default, compact, summary, warning',
    'rest, hover, selected',
  ],
  [
    'Badge',
    'Expose status or category',
    'draft, pending, approved, returned, posted',
    'static, focus when interactive',
  ],
  [
    'Table',
    'Dense fiscal and administrative records',
    'sortable, selected, empty',
    'hover, selected, loading, empty',
  ],
];

const workflowSteps = [
  {
    icon: FileSpreadsheet,
    title: 'Request',
    description: 'The originating office drafts an OBR, PPMP, travel order, or worksheet entry.',
  },
  {
    icon: ShieldCheck,
    title: 'Review',
    description:
      'Approvers verify budget, role permissions, and supporting details before moving forward.',
  },
  {
    icon: CircleDollarSign,
    title: 'Commit',
    description:
      'Financial records preserve decimal values as strings until service-layer casting is required.',
  },
  {
    icon: CopyCheck,
    title: 'Archive',
    description:
      'Final records remain searchable by office, reference, status, and UTC+8 display date.',
  },
];

const summaryCards: {
  title: string;
  description: string;
  icon: LucideIcon;
  tone: 'primary' | 'warning' | 'success';
}[] = [
  {
    title: 'OBR Requests',
    description: '24 pending review',
    icon: FileSpreadsheet,
    tone: 'primary',
  },
  {
    title: 'Account Approvals',
    description: '6 users awaiting action',
    icon: UserCheck,
    tone: 'warning',
  },
  {
    title: 'System Integrity',
    description: 'All required services online',
    icon: ShieldCheck,
    tone: 'success',
  },
];

const codeSamples = {
  button: `import { Button } from "@/components/ui/button";

<Button type="submit">
  Submit OBR
</Button>`,
  input: `import { Input } from "@/components/ui/input";

<Input
  aria-invalid={Boolean(errors.amount)}
  inputMode="decimal"
  placeholder="0.00"
/>`,
  status: `import { Badge } from "@/components/ui/badge";

<Badge className="border-[#FFB30F]/30 bg-[#FFF3D6] text-[#7A4B00]">
  Pending
</Badge>`,
};

export default function DesignSystemPage() {
  return (
    <main className="min-h-screen bg-[#F7FAFC] text-[#122033]">
      <section className="relative overflow-hidden border-b border-[#D8E2EC] bg-white">
        <div className="absolute inset-y-0 right-0 hidden w-[42vw] opacity-95 lg:block">
          <IdentityMosaic />
        </div>
        <div className="relative mx-auto grid min-h-[560px] max-w-7xl items-end px-6 pb-12 pt-6 md:px-10 lg:grid-cols-[1fr_520px] lg:pb-16">
          <div className="max-w-3xl">
            <div className="mb-12 flex flex-wrap items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-[#29639F] text-white">
                <Layers3 className="size-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase text-[#29639F]">Oasis-Next</p>
                <p className="text-sm text-[#52657A]">Municipality of Tigbauan management system</p>
              </div>
            </div>
            <Badge className="mb-5 border-[#FFB30F]/30 bg-[#FFF3D6] px-3 py-1 text-[#7A4B00]">
              Design System
            </Badge>
            <h1 className="max-w-3xl text-5xl font-bold leading-[1.02] tracking-normal text-[#022551] md:text-7xl">
              One civic interface language for financial operations.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#52657A]">
              A human-readable and agent-usable source of truth for Oasis tokens, reusable UI
              primitives, workflow states, and implementation rules.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button className="bg-[#29639F] hover:bg-[#1F4F80]">
                Start with tokens
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
              <Button variant="outline" className="border-[#AEBFD0] bg-white">
                Component rules
              </Button>
            </div>
          </div>
        </div>
      </section>

      <nav className="sticky top-0 z-20 border-b border-[#D8E2EC] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-6 py-3 md:px-10">
          {navItems.map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase().replaceAll(' ', '-')}`}
              className="shrink-0 rounded-md px-3 py-2 text-sm font-medium text-[#52657A] transition-colors hover:bg-[#EAF2FA] hover:text-[#022551] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#29639F]"
            >
              {item}
            </a>
          ))}
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-6 py-12 md:px-10">
        <section className="grid gap-6 lg:grid-cols-[280px_1fr]" id="agent-rules">
          <aside className="text-sm text-[#52657A]">
            <p className="font-semibold uppercase text-[#29639F]">For AI agents</p>
            <p className="mt-2 leading-6">
              Use this page before creating or changing UI. It defines the expected component
              imports, token names, state coverage, and domain-specific constraints.
            </p>
          </aside>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              'Import reusable UI from components/ui before writing custom primitives.',
              'Use oasisTokens from lib/tokens.ts for color, spacing, radius, and typography decisions.',
              'Represent financial values as strings and format timestamps for UTC+8 at the UI boundary.',
            ].map((rule) => (
              <Card key={rule} className="rounded-lg border-[#D8E2EC] bg-white shadow-none">
                <CardContent className="flex gap-3 pt-6">
                  <CheckCircle2
                    className="mt-0.5 size-5 shrink-0 text-[#15803D]"
                    aria-hidden="true"
                  />
                  <p className="text-sm leading-6 text-[#122033]">{rule}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <SectionHeader
          id="tokens"
          kicker="Tokens"
          title="Visual primitives"
          description="Every repeated color, spacing value, radius, and type role should map back to these tokens."
        />

        <div className="grid gap-6">
          {colorGroups.map((group) => (
            <section key={group.name}>
              <h3 className="mb-3 text-sm font-semibold uppercase text-[#52657A]">{group.name}</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {Object.entries(group.tokens).map(([name, value]) => (
                  <ColorSwatch key={name} name={name} value={value} />
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <TokenPanel title="Spacing Scale" items={Object.entries(oasisTokens.spacing)} />
          <TokenPanel title="Radius Scale" items={Object.entries(oasisTokens.radius)} />
          <Card className="rounded-lg border-[#D8E2EC] bg-white shadow-none">
            <CardHeader>
              <CardTitle>Typography</CardTitle>
              <CardDescription>Root layout uses Geist and Geist Mono.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(oasisTokens.typography).map(([name, token]) => (
                <div key={name} className="border-b border-[#D8E2EC] pb-3 last:border-0 last:pb-0">
                  <p className="text-sm font-semibold capitalize text-[#022551]">{name}</p>
                  <p className={cn('mt-1 text-sm text-[#52657A]', name === 'mono' && 'font-mono')}>
                    {token.family} / weight {token.weight}
                  </p>
                  <p className="mt-1 text-xs text-[#7A8A9B]">{token.usage}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <SectionHeader
          id="guidelines"
          kicker="Guidelines"
          title="Rules that protect product quality"
          description="Oasis is used for repeated administrative work. Interfaces should be dense, legible, permission-aware, and explicit about workflow state."
        />

        <div className="grid gap-4 md:grid-cols-2">
          <Guideline icon={LockKeyhole} title="Permission visibility">
            Navigation and actions must be gated by the same permission model used by the server
            route or API boundary.
          </Guideline>
          <Guideline icon={PhilippinePeso} title="Financial display">
            Money is typed as a string in payloads. Components can align and format values, but
            arithmetic belongs in service logic with Decimal helpers.
          </Guideline>
          <Guideline icon={Clock3} title="Date and time">
            Display user-facing dates in UTC+8. Keep API values unchanged and centralize formatting
            through shared utilities.
          </Guideline>
          <Guideline icon={AlertCircle} title="State coverage">
            Every form and workflow view must include loading, empty, disabled, validation error,
            and success states where applicable.
          </Guideline>
        </div>

        <SectionHeader
          id="button"
          kicker="Button"
          title="Action hierarchy"
          description="Use primary blue for the main task, outline for secondary actions, destructive only for irreversible changes."
        />
        <ComponentShowcase code={codeSamples.button}>
          <div className="flex flex-wrap items-center gap-3">
            <Button className="bg-[#29639F] hover:bg-[#1F4F80]">Create request</Button>
            <Button variant="outline" className="border-[#AEBFD0]">
              Save draft
            </Button>
            <Button variant="secondary">Review later</Button>
            <Button variant="destructive">Return request</Button>
            <Button disabled>Submitting</Button>
          </div>
        </ComponentShowcase>

        <SectionHeader
          id="input"
          kicker="Input"
          title="Validated form fields"
          description="Inputs should always be paired with visible labels and clear validation copy."
        />
        <ComponentShowcase code={codeSamples.input}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Payee" hint="Default">
              <Input placeholder="Juan Dela Cruz" />
            </Field>
            <Field label="OBR amount" hint="Decimal string">
              <Input inputMode="decimal" placeholder="12500.00" />
            </Field>
            <Field label="Reference code" hint="Error">
              <Input aria-invalid defaultValue="OBR-2026-0007" />
              <p className="mt-2 text-sm text-[#B42318]">Reference code already exists.</p>
            </Field>
            <Field label="Closed fiscal year" hint="Disabled">
              <Input disabled defaultValue="2025" />
            </Field>
          </div>
        </ComponentShowcase>

        <SectionHeader
          id="card"
          kicker="Card"
          title="Administrative surfaces"
          description="Cards are for repeated summaries, dialogs, and compact tools. Do not nest page sections inside decorative cards."
        />
        <div className="grid gap-4 md:grid-cols-3">
          {summaryCards.map(({title, description, icon: Icon, tone}) => (
            <Card
              key={title}
              className="rounded-lg border-[#D8E2EC] bg-white shadow-none transition-colors hover:border-[#AEBFD0]"
            >
              <CardHeader>
                <div
                  className={cn(
                    'mb-2 flex size-10 items-center justify-center rounded-lg',
                    tone === 'primary' && 'bg-[#EAF2FA] text-[#29639F]',
                    tone === 'warning' && 'bg-[#FFF3D6] text-[#B7791F]',
                    tone === 'success' && 'bg-[#DCFCE7] text-[#15803D]',
                  )}
                >
                  <Icon className="size-5" aria-hidden="true" />
                </div>
                <CardTitle className="text-[#022551]">{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>

        <SectionHeader
          id="badge"
          kicker="Badge"
          title="Workflow status color"
          description="Use soft-tint backgrounds with clear text. Avoid solid status fills in dense tables."
        />
        <ComponentShowcase code={codeSamples.status}>
          <div className="flex flex-wrap gap-3">
            {statusBadges.map((badge) => (
              <Badge
                key={badge.label}
                variant="outline"
                className={cn('px-3 py-1', badge.className)}
              >
                {badge.label}
              </Badge>
            ))}
          </div>
        </ComponentShowcase>

        <SectionHeader
          id="alert"
          kicker="Alert"
          title="System feedback"
          description="Alerts explain consequences, blockers, and service state. Keep them short and action-oriented."
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <Alert className="border-[#D8E2EC] bg-white">
            <Info className="size-4 text-[#2563EB]" aria-hidden="true" />
            <AlertTitle>Invite token generated</AlertTitle>
            <AlertDescription>
              Send the token through the approved invitation flow. Do not expose it in public
              channels.
            </AlertDescription>
          </Alert>
          <Alert variant="destructive" className="border-[#FEE4E2] bg-[#FFF8F7]">
            <TriangleAlert className="size-4" aria-hidden="true" />
            <AlertTitle>Cannot approve request</AlertTitle>
            <AlertDescription>
              The request exceeds the available allotment for this office and fiscal period.
            </AlertDescription>
          </Alert>
        </div>

        <SectionHeader
          id="table"
          kicker="Table"
          title="Dense records"
          description="Tables should prioritize scanning, stable columns, explicit empty states, and right-aligned monetary values."
        />
        <Card className="rounded-lg border-[#D8E2EC] bg-white shadow-none">
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Office</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  ['OBR-2026-0007', 'Accounting', 'Pending', '125,000.00'],
                  ['OBR-2026-0008', 'Engineering', 'Approved', '78,450.50'],
                  ['TO-2026-0014', "Mayor's Office", 'Draft', '9,800.00'],
                ].map(([reference, office, status, amount]) => (
                  <TableRow key={reference}>
                    <TableCell className="font-mono text-xs text-[#022551]">{reference}</TableCell>
                    <TableCell>{office}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          'px-2',
                          statusBadges.find((item) => item.label === status)?.className,
                        )}
                      >
                        {status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">{amount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <SectionHeader
          id="workflow"
          kicker="Workflow"
          title="Domain pattern"
          description="Oasis screens should expose where the record is, who can act, and what data changes next."
        />
        <div className="grid gap-4 md:grid-cols-4">
          {workflowSteps.map((step, index) => (
            <div
              key={step.title}
              className="relative rounded-lg border border-[#D8E2EC] bg-white p-5"
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="flex size-10 items-center justify-center rounded-lg bg-[#EAF2FA] text-[#29639F]">
                  <step.icon className="size-5" aria-hidden="true" />
                </div>
                <span className="font-mono text-xs text-[#7A8A9B]">0{index + 1}</span>
              </div>
              <h3 className="font-semibold text-[#022551]">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#52657A]">{step.description}</p>
            </div>
          ))}
        </div>

        <SectionHeader
          id="agent-rules"
          kicker="Component registry"
          title="Implementation matrix"
          description="Before considering UI work complete, check that the expected imports, variants, and states are represented."
        />
        <Tabs defaultValue="matrix" className="gap-4">
          <TabsList className="bg-[#EAF2FA]">
            <TabsTrigger value="matrix">Matrix</TabsTrigger>
            <TabsTrigger value="checks">Checklist</TabsTrigger>
            <TabsTrigger value="snippets">Snippets</TabsTrigger>
          </TabsList>
          <TabsContent value="matrix">
            <Card className="rounded-lg border-[#D8E2EC] bg-white shadow-none">
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Component</TableHead>
                      <TableHead>Purpose</TableHead>
                      <TableHead>Variants</TableHead>
                      <TableHead>Required states</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {componentRows.map(([component, purpose, variants, states]) => (
                      <TableRow key={component}>
                        <TableCell className="font-semibold text-[#022551]">{component}</TableCell>
                        <TableCell>{purpose}</TableCell>
                        <TableCell>{variants}</TableCell>
                        <TableCell>{states}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="checks">
            <div className="grid gap-3 md:grid-cols-2">
              {[
                'All actions have loading and disabled affordances.',
                'All hidden inputs preserve visible focus treatment.',
                'No frontend view calls service functions directly; use API routes.',
                'Permission-gated UI mirrors server verification rules.',
                'Empty states say what happened and what the user can do next.',
                'Amounts are strings and displayed with stable decimal formatting.',
              ].map((item) => (
                <label
                  key={item}
                  className="flex items-start gap-3 rounded-lg border border-[#D8E2EC] bg-white p-4"
                >
                  <Checkbox className="mt-0.5" />
                  <span className="text-sm leading-6 text-[#122033]">{item}</span>
                </label>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="snippets">
            <div className="grid gap-4 lg:grid-cols-3">
              {Object.entries(codeSamples).map(([name, code]) => (
                <CodeBlock key={name} code={code} />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

function SectionHeader({
  id,
  kicker,
  title,
  description,
}: {
  id: string;
  kicker: string;
  title: string;
  description: string;
}) {
  return (
    <section id={id} className="scroll-m-20 pb-5 pt-16">
      <p className="text-sm font-semibold uppercase text-[#29639F]">{kicker}</p>
      <h2 className="mt-2 max-w-3xl text-3xl font-bold tracking-normal text-[#022551] md:text-4xl">
        {title}
      </h2>
      <p className="mt-3 max-w-3xl text-base leading-7 text-[#52657A]">{description}</p>
    </section>
  );
}

function ColorSwatch({name, value}: {name: string; value: string}) {
  return (
    <Card className="overflow-hidden rounded-lg border-[#D8E2EC] bg-white py-0 shadow-none">
      <div className="h-24 border-b border-[#D8E2EC]" style={{backgroundColor: value}} />
      <CardContent className="p-4">
        <p className="font-medium text-[#022551]">{splitCamel(name)}</p>
        <p className="mt-1 font-mono text-xs text-[#52657A]">{value}</p>
      </CardContent>
    </Card>
  );
}

function TokenPanel({title, items}: {title: string; items: [string, string][]}) {
  return (
    <Card className="rounded-lg border-[#D8E2EC] bg-white shadow-none">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Use fixed steps for predictable layout rhythm.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map(([name, value]) => (
          <div
            key={name}
            className="flex items-center justify-between border-b border-[#D8E2EC] pb-2 last:border-0 last:pb-0"
          >
            <span className="font-mono text-sm text-[#022551]">{name}</span>
            <span className="font-mono text-sm text-[#52657A]">{value}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function Guideline({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[#D8E2EC] bg-white p-5">
      <div className="flex items-start gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#EAF2FA] text-[#29639F]">
          <Icon className="size-5" aria-hidden="true" />
        </div>
        <div>
          <h3 className="font-semibold text-[#022551]">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-[#52657A]">{children}</p>
        </div>
      </div>
    </div>
  );
}

function Field({label, hint, children}: {label: string; hint: string; children: React.ReactNode}) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center justify-between gap-4 text-sm font-medium text-[#022551]">
        {label}
        <span className="text-xs font-normal text-[#7A8A9B]">{hint}</span>
      </span>
      {children}
    </label>
  );
}

function ComponentShowcase({children, code}: {children: React.ReactNode; code: string}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
      <div className="rounded-lg border border-[#D8E2EC] bg-white p-6">{children}</div>
      <CodeBlock code={code} />
    </div>
  );
}

function CodeBlock({code}: {code: string}) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-[#D8E2EC] bg-[#122033] p-4 text-sm leading-6 text-[#DDF6FF]">
      <code>{code}</code>
    </pre>
  );
}

function IdentityMosaic() {
  return (
    <div className="grid h-full grid-cols-4 grid-rows-5 bg-black">
      <div className="rounded-br-[70%] bg-[#18AEE2]" />
      <div className="bg-[repeating-linear-gradient(0deg,#FFB30F_0_24px,#29639F_24px_48px)]" />
      <div className="rounded-b-full bg-[#18AEE2]" />
      <div className="rounded-bl-[90%] border-[36px] border-[#FFB30F] bg-[#29639F]" />
      <div className="rounded-t-full bg-[#FFB30F]" />
      <div className="grid place-items-center bg-[#29639F]">
        <div className="size-28 rounded-full border-[26px] border-[#18AEE2] bg-[#FFB30F]" />
      </div>
      <div className="rounded-br-[100%] bg-[#FFB30F]" />
      <div className="grid place-items-center bg-[#18AEE2]">
        <div className="size-20 rounded-full border-[20px] border-black bg-[#FFB30F]" />
      </div>
      <div className="grid place-items-center bg-[#29639F]">
        <div className="size-24 rounded-full bg-[#FFB30F]" />
      </div>
      <div className="rounded-br-[100%] rounded-tl-[100%] bg-[#FFB30F]" />
      <div className="grid place-items-center bg-[#29639F]">
        <div className="size-32 rounded-full bg-[#18AEE2]" />
      </div>
      <div className="rounded-bl-[100%] bg-[#FFB30F]" />
      <div className="rounded-tr-[100%] bg-[#18AEE2]" />
      <div className="bg-[repeating-linear-gradient(90deg,#29639F_0_22px,transparent_22px_48px)]" />
      <div className="grid place-items-center bg-[#FFB30F]">
        <div className="size-20 rotate-45 bg-[#18AEE2]" />
      </div>
      <div className="rounded-tl-[100%] bg-[#29639F]" />
      <div className="col-span-4 flex items-end bg-[#FFB30F] p-8 text-white">
        <div>
          <Sparkles className="mb-3 size-8" aria-hidden="true" />
          <p className="text-xs font-bold uppercase tracking-[0.35em]">Wisdomaus Software Inc</p>
        </div>
      </div>
    </div>
  );
}

function splitCamel(value: string) {
  return value.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
}
