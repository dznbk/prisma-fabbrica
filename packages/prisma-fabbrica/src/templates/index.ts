import { DMMF } from "@prisma/generator-helper";
import ts from "typescript";
import { template } from "talt";

function camelize(pascal: string) {
  return pascal[0].toLowerCase() + pascal.slice(1);
}

export function findPrsimaCreateInputTypeFromModelName(document: DMMF.Document, modelName: string) {
  const inputType = document.schema.inputObjectTypes.prisma.find(x => x.name === `${modelName}CreateInput`);
  if (!inputType) throw new Error("");
  return inputType;
}

export function filterScalarFields(inputType: DMMF.InputType) {
  return inputType.fields.filter(
    field =>
      field.inputTypes.length > 0 && field.inputTypes.every(childInputType => childInputType.location === "scalar"),
  );
}

export function filterNonNullScalarFields(inputType: DMMF.InputType) {
  return filterScalarFields(inputType).filter(field => !field.isNullable);
}

export function filterObjectTypeFields(inputType: DMMF.InputType) {
  return inputType.fields.filter(
    field =>
      field.inputTypes.length > 0 &&
      field.inputTypes.every(childInputType => childInputType.location === "inputObjectTypes"),
  );
}

export const header = template.sourceFile`
  import { Prisma } from "@prisma/client";
  import { getClient } from "@quramy/prisma-fabbrica";
  import scalarFieldValueGenerator from "@quramy/prisma-fabbrica/lib/scalar/gen";
  import { Resolver, resolveValue } from "@quramy/prisma-fabbrica/lib/helpers";
  
`;

export const scalarFieldType = (
  modelName: string,
  fieldName: string,
  inputType: DMMF.SchemaArgInputType,
): ts.TypeNode => {
  if (inputType.location !== "scalar") {
    throw new Error("Invalid call. This function is allowed for only scalar field.");
  }
  switch (inputType.type) {
    case "Boolean":
      return ts.factory.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword);
    case "String":
      return ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
    case "Int":
    case "Float":
      return ts.factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword);
    case "BigInt":
      return ts.factory.createKeywordTypeNode(ts.SyntaxKind.BigIntKeyword);
    case "Decimal":
      return template.typeNode`Prisma.Decimal`();
    case "DateTime":
      return template.typeNode`Date`();
    case "Bytes":
      return template.typeNode`Buffer`();
    case "JSON":
      // FIXME Is the folloing type right?
      // return template.typeNode`Prisma.Json`();
      return ts.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword);
    default:
      throw new Error(`Unknown scalar type "${inputType.type}" for ${modelName}.${fieldName} .`);
  }
};

export const modelScalarFields = (modelName: string, inputType: DMMF.InputType) =>
  template.statement<ts.TypeAliasDeclaration>`
    type MODEL_SCALAR_FIELDS = ${() =>
      ts.factory.createTypeLiteralNode(
        filterNonNullScalarFields(inputType).map(field =>
          ts.factory.createPropertySignature(
            undefined,
            field.name,
            undefined,
            scalarFieldType(modelName, field.name, field.inputTypes[0]),
          ),
        ),
      )}
  `({
    MODEL_SCALAR_FIELDS: ts.factory.createIdentifier(`${modelName}ScalarFields`),
  });

export const modelFactoryDefineInput = (modelName: string, inputTpue: DMMF.InputType) =>
  template.statement<ts.TypeAliasDeclaration>`
    type MODEL_FACTORY_DEFINE_INPUT = ${() =>
      ts.factory.createTypeLiteralNode([
        ...filterScalarFields(inputTpue).map(field =>
          ts.factory.createPropertySignature(
            undefined,
            field.name,
            ts.factory.createToken(ts.SyntaxKind.QuestionToken),
            scalarFieldType(modelName, field.name, field.inputTypes[0]),
          ),
        ),
        ...filterObjectTypeFields(inputTpue).map(field =>
          ts.factory.createPropertySignature(
            undefined,
            field.name,
            !field.isRequired ? ts.factory.createToken(ts.SyntaxKind.QuestionToken) : undefined,
            ts.factory.createTypeReferenceNode(
              template.expression<ts.Identifier>`Prisma.${() =>
                ts.factory.createIdentifier(field.inputTypes[0].type as string)}`(),
            ),
          ),
        ),
      ])};
  `({
    MODEL_FACTORY_DEFINE_INPUT: ts.factory.createIdentifier(`${modelName}FactoryDefineInput`),
  });

export const modelFactoryDefineOptions = (modelName: string) =>
  template.statement<ts.TypeAliasDeclaration>`
    type MODEL_FACTORY_DEFINE_OPTIONS = {
      defaultData: Resolver<MODEL_FACTORY_DEFINE_INPUT>;
    };
  `({
    MODEL_FACTORY_DEFINE_OPTIONS: ts.factory.createIdentifier(`${modelName}FactoryDefineOptions`),
    MODEL_FACTORY_DEFINE_INPUT: ts.factory.createIdentifier(`${modelName}FactoryDefineInput`),
  });

export const autoGenrateModelScalars = (modelName: string, inputType: DMMF.InputType, model: DMMF.Model) =>
  template.statement<ts.FunctionDeclaration>`
    function AUTO_GENRATE_MODEL_SCALARS(): MODEL_SCALAR_FIELDS {
      return ${() =>
        ts.factory.createObjectLiteralExpression(
          filterNonNullScalarFields(inputType).map(field =>
            ts.factory.createPropertyAssignment(
              ts.factory.createIdentifier(field.name),
              template.expression`scalarFieldValueGenerator.SCALAR_TYPE({ modelName: MODEL_NAME, fieldName: FIELD_NAME, isId: IS_ID, isUnique: IS_UNIQUE })`(
                {
                  SCALAR_TYPE: ts.factory.createIdentifier(field.inputTypes[0].type as string),
                  MODEL_NAME: ts.factory.createStringLiteral(modelName),
                  FIELD_NAME: ts.factory.createStringLiteral(field.name),
                  IS_ID: model.fields.find(f => f.name === field.name)!.isId
                    ? ts.factory.createTrue()
                    : ts.factory.createFalse(),
                  IS_UNIQUE: model.fields.find(f => f.name === field.name)!.isUnique
                    ? ts.factory.createTrue()
                    : ts.factory.createFalse(),
                },
              ),
            ),
          ),
          true,
        )};
    }
  `({
    AUTO_GENRATE_MODEL_SCALARS: ts.factory.createIdentifier(`autoGenrate${modelName}Scalars`),
    MODEL_SCALAR_FIELDS: ts.factory.createIdentifier(`${modelName}ScalarFields`),
  });

export const defineModelFactory = (modelName: string) =>
  template.statement<ts.FunctionDeclaration>`
    export function DEFINE_MODEL_FACTORY({
      defaultData: defaultDataResolver
    }: MODEL_FACTORY_DEFINE_OPTIONS) {
      const create = async (
        inputData: Partial<Prisma.MODEL_CREATE_INPUT> = {}
      ) => {
        const requiredScalarData = AUTO_GENRATE_MODEL_SCALARS()
        const defaultData= await resolveValue(defaultDataResolver);
        const data = { ...requiredScalarData, ...defaultData, ...inputData};
        return await getClient().MODEL_KEY.create({ data });
      };
      return { create };
    }
  `({
    MODEL_KEY: ts.factory.createIdentifier(camelize(modelName)),
    DEFINE_MODEL_FACTORY: ts.factory.createIdentifier(`define${modelName}Factory`),
    MODEL_FACTORY_DEFINE_OPTIONS: ts.factory.createIdentifier(`${modelName}FactoryDefineOptions`),
    MODEL_CREATE_INPUT: ts.factory.createIdentifier(`${modelName}CreateInput`),
    AUTO_GENRATE_MODEL_SCALARS: ts.factory.createIdentifier(`autoGenrate${modelName}Scalars`),
  });

export const defineFnMapSet = (modelName: string) =>
  template.statement<ts.ExpressionStatement>`
    defineFnMap.set(MODEL_NAME, DEFINE_MODEL_FACTORY);
  `({
    MODEL_NAME: ts.factory.createStringLiteral(modelName),
    DEFINE_MODEL_FACTORY: ts.factory.createIdentifier(`define${modelName}Factory`),
  });

export function getSourceFile(document: DMMF.Document) {
  const statements = [
    ...header().statements,
    ...document.datamodel.models.flatMap(model => [
      modelScalarFields(model.name, findPrsimaCreateInputTypeFromModelName(document, model.name)),
      modelFactoryDefineInput(model.name, findPrsimaCreateInputTypeFromModelName(document, model.name)),
      modelFactoryDefineOptions(model.name),
      autoGenrateModelScalars(model.name, findPrsimaCreateInputTypeFromModelName(document, model.name), model),
      defineModelFactory(model.name),
    ]),
  ];

  return ts.factory.updateSourceFile(header(), statements);
}
