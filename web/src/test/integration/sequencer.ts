import { BaseSequencer, type TestSpecification } from 'vitest/node'

/** The integration files share one database and build on each other, so run them strictly in file-name order. */
export default class NameOrderSequencer extends BaseSequencer {
  async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    return [...files].sort((a, b) => a.moduleId.localeCompare(b.moduleId))
  }
}
