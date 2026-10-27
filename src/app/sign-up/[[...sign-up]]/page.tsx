import { SignUp } from "@clerk/nextjs";
import { Suspense } from "react";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Suspense fallback={<div className="text-sm font-mono text-[#6E829B]">Loading Sign Up...</div>}>
        <SignUp />
      </Suspense>
    </div>
  );
}
