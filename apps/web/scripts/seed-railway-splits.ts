import "dotenv/config";
import { MailSplitFilterKind } from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import { createMailSplit } from "@/utils/split-inbox/splits.server";

async function main() {
  const [email, important, calendar, news, pitch] = process.argv.slice(2);
  if (!email || !important || !calendar || !news || !pitch) {
    throw new Error(
      "Usage: seed-railway-splits.ts EMAIL IMPORTANT_LABEL_ID CALENDAR_LABEL_ID NEWS_LABEL_ID PITCH_LABEL_ID",
    );
  }
  const account = await prisma.emailAccount.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!account) throw new Error(`Email account not found: ${email}`);
  const from = MailSplitFilterKind.FROM;
  const label = MailSplitFilterKind.LABEL;
  const splits = [
    {
      name: "Tidal Internal",
      filters: [{ kind: from, value: "@tidalvc.com" }],
    },
    { name: "Important", filters: [{ kind: label, value: important }] },
    { name: "Calendar", filters: [{ kind: label, value: calendar }] },
    {
      name: "GitHub",
      filters: [
        { kind: from, value: "mentions@noreply.github.com" },
        { kind: from, value: "notifications@github.com" },
      ],
    },
    {
      name: "Notion",
      filters: [{ kind: from, value: "notify@mail.notion.so" }],
    },
    { name: "News", filters: [{ kind: label, value: news }] },
    { name: "Pitch", filters: [{ kind: label, value: pitch }] },
  ];
  for (const split of splits) {
    const result = await createMailSplit({
      emailAccountId: account.id,
      ...split,
      matchAll: split.filters.length === 1,
    });
    if (!result || result.status === "limit")
      throw new Error(
        `Could not create ${split.name}: split limit reached or insertion failed`,
      );
    console.log(`${split.name}: ${result.status}`);
  }
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
