import { accountStore } from '../state/account';
import { useStore } from '../state/store';

export function Toast() {
  const { toast } = useStore(accountStore);
  return toast ? (
    <div className="toast panel" role="status">
      {toast}
    </div>
  ) : null;
}
