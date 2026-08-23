import dynamic from 'next/dynamic';

const CampaignGenerator = dynamic(
  () => import('../components/CampaignGenerator'),
  { ssr: false }
);

export default function Home() {
  return <CampaignGenerator />;
}