

export default function ToastContainer({ toasts, onDismiss }) {
  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast-${toast.type}`}
          onClick={() => onDismiss(toast.id)}
          role="status"
        >
          <span>{toast.message}</span>


          <button
            type="button"
            className="toast-close"
            aria-label="Dismiss notification"
            onClick={(event) => {
              event.stopPropagation();
              onDismiss(toast.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}