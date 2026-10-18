import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/** 返回入口链接，详情页与写作页共用。 */
export function BackLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Link className="back-link" to={to}>
      {children}
    </Link>
  );
}
