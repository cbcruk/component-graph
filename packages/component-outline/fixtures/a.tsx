import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { useState } from 'react';

interface ProfileProps {
  user: User;
}

export function Profile({ user, size = 2, ...rest }: ProfileProps) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <div className="card" data-open={open}>
      <Avatar src={user.avatar} />
      {open ? <span>online</span> : null}
      {user.admin && <Badge />}
      hello
    </div>
  );
}
