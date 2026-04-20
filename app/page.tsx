import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { RizzyExperience } from "@/components/RizzyExperience";

export default function Page() {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <Header />
      <RizzyExperience />
      <Footer />
    </div>
  );
}
