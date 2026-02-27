"use client";

import { Avatar, AvatarImage } from "@/components/ui/avatar";
import Typography from "@/components/typography";

export default function DeadHamster() {
  return (
    <div className="p-4 pt-0 w-full">
      <Avatar className="lg:h-100 lg:w-100 md:h-50 md:w-50 sm:h-25 sm:w-25 ml-auto mr-auto mt-8 mb-8">
        <AvatarImage
          src="/assets/dead.jpg"
          alt="Dead Hamster."
          className="grayscale"
        />
      </Avatar>
      <Typography variant="h1" className="text-center mb-6">Oops. Somewhat it didn&apos;t worked.</Typography>
      <Typography variant="h4" className="text-center">
        We&apos;re figuring something out. It&apos;s already been logged and reported to the developers.<br />
        You can try again later.
      </Typography>
    </div>
  );
}
