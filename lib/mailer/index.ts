import { Resend } from "resend";

const { RESEND_API_KEY, RESEND_FROM_ADDRESS } = process.env;
const resend = new Resend(RESEND_API_KEY);

export async function send(args: SendArgs): ReturnType<typeof resend.emails.send> {
  return await resend.emails.send({
    ...args,
    from: RESEND_FROM_ADDRESS!,
  });
}

type SendArgs = {
  to: Array<string>;
  subject: string;
  html: string;
}
