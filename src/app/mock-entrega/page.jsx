'use client';
import DeliveryExperience from '@/components/delivery/DeliveryExperience';
export default function Mock() {
  const order = { id: 'x', orderNumber: 'NS-1234', honoreeName: 'Faiana', customerName: 'Leo', musicStyle: 'Sertanejo Universitário', occasion: 'Aniversário', lyrics: '[Verso]\nLinha\n[Refrão]\nLinha', coverUrl: '', paymentStatus: 'AGUARDANDO_PAGAMENTO', productionStatus: 'AUDIO_GERADO' };
  return <div className="nx-experience"><DeliveryExperience order={order} orderId="x" paid={false} tracks={['/x.mp3', '/y.mp3']} promo={null} onDownload={() => {}} onProduct={() => {}} onCharge={() => {}} onApproved={() => {}} supportUrl="#" /></div>;
}
