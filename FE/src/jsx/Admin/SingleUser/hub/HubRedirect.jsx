import React from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";

const HubRedirect = ({ tab }) => {
  const { id } = useParams();
  const [params] = useSearchParams();
  const edit = params.get("edit") === "1" ? "&edit=1" : "";
  return <Navigate to={`/admin/users/${id}?tab=${tab}${edit}`} replace />;
};

export default HubRedirect;
