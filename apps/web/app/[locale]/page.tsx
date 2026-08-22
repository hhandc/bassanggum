type HomePageProps = {
  params: Promise<{ locale: string }>;
};

export default async function HomePage({ params }: HomePageProps) {
  await params;

  return (
    <main>
      <h1>Bassanggum</h1>
    </main>
  );
}
