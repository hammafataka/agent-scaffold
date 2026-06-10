import { SkillSpec } from "../plugins/types";
import content from "./pdd-content.json";

export function pddSkills(): SkillSpec[] {
  return (content.skills as SkillSpec[]).map((sk) => ({ ...sk }));
}
