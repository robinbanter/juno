import { CreateForm } from "./CreateForm";

export const metadata = { title: "Create" };

export default function CreatePage() {
  return (
    <div className="mx-auto w-full max-w-[560px] px-4 pt-4 lg:px-8">
      <h1 className="text-[26px] font-bold tracking-tight">Create</h1>
      <p className="mt-1 text-[14px] text-j-muted">
        Publish a post or a reel. Either way it launches a bonding-curve pool
        that graduates into DAMM v2 liquidity.
      </p>
      <CreateForm />
    </div>
  );
}
