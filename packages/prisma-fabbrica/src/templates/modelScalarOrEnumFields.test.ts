import { getDMMF } from "@prisma/internals";
import { template, printNode } from "talt";

import { modelScalarOrEnumFields, findPrsimaCreateInputTypeFromModelName } from ".";

describe(modelScalarOrEnumFields, () => {
  it.each([
    {
      pattern: "Scalar field variation",
      datamodel: `
        model TestModel {
          id            Int @id
          boolField     Boolean
          strField      String
          floatField    Float
          bigIntField   BigInt
          bytesField    Bytes
          dateTimeField DateTime
        }
      `,
      expected: `
        type TestModelScalarOrEnumFields = {
          id: number;
          boolField: boolean;
          strField: string;
          floatField: number;
          bigIntField: bigint;
          bytesField: Buffer;
          dateTimeField: Date;
        }
      `,
    },
    {
      pattern: "Complex id",
      datamodel: `
        model TestModel {
          complexIdField  Int
          idField2        String
          @@id([complexIdField, idField2])
        }
      `,
      expected: `
        type TestModelScalarOrEnumFields = {
          complexIdField: number;
          idField2: string;
        }
      `,
    },
  ])("generates literal type field for $pattern", async ({ datamodel, expected }) => {
    const dmmf = await getDMMF({
      datamodel,
    });
    const inputType = findPrsimaCreateInputTypeFromModelName(dmmf, "TestModel");
    const source = template.statement(expected)();
    expect(printNode(modelScalarOrEnumFields(dmmf.datamodel.models[0], inputType))).toBe(printNode(source).trim());
  });

  it("does not generate for nullable field", async () => {
    const dmmf = await getDMMF({
      datamodel: `
        model TestModel {
          id Int @id
          nullableField Int?
        }
      `,
    });
    const inputType = findPrsimaCreateInputTypeFromModelName(dmmf, "TestModel");
    const expected = template.sourceFile`
      type TestModelScalarOrEnumFields = {
        id: number;
      }
    `();
    expect(printNode(modelScalarOrEnumFields(dmmf.datamodel.models[0], inputType))).toBe(printNode(expected).trim());
  });
});
