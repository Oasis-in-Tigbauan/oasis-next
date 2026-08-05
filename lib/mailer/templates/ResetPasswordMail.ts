export const ResetPasswordMail = ({resetURL}: ResetMailProps) => `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Reset Password</title>
  </head>
  <body>
    <p>Hello,</p>

    <p>
      You recently requested to Reset your Password. To reset your password now, click
      <a href="${resetURL}">here</a>.
    </p>

    <p>
      If you can’t click the link, copy and paste this full URL into your browser:
    </p>

    <p>
      <strong>${resetURL}</strong>
    </p>

    <p>
      If you haven't requested this, please ignore and contact the administrator.
    </p>

    <p>
      Thanks,<br />
      <strong>Tigbauan Municipality</strong>
    </p>
  </body>
</html>
`;

type ResetMailProps = {
  resetURL: string;
};
