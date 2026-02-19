import OperationalPlan from "./OperationPlan";

export function PlanTab() {
  return (
    <div className="overlay-tab-content" role="tabpanel" aria-labelledby="overlay-tab-plan">
      <OperationalPlan />
    </div>
  );
}
