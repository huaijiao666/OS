interface ToastProps {
  type: string;
  message: string;
}

export default function Toast({ type, message }: ToastProps) {
  return (
    <div className={`toast ${type}`}>
      <span>{message}</span>
    </div>
  );
}
