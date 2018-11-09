var xml = require('libxmljs')
var fs = require('fs-extra')
var utils = require('./packageUtils')
var path = require('path')

// ====================================================================================================
// ======================================      Matchers     ===========================================
// ====================================================================================================
// Base
function isDirMatch(file, metadata) {
    var str = utils.escape(path.sep + 'src' + path.sep + metadata.dir + path.sep)
    return file.path.match(new RegExp(str))
}
function isNameMatch(file, metadata) {
    return file.path.match(new RegExp(metadata.name + '.' + metadata.extension))
}
function isExtensionMatch(file, metadata) {
    return (metadata.extension === undefined && !file.path.endsWith('-meta.xml')) || file.path.endsWith(metadata.extension)
}
function isFile(file, metadata) {
    return file.stats.isFile()
}
function isMetadataExtensionMatch(file, metadata) {
    return file.path.endsWith('-meta.xml')
}


// Composed
function isBaseMatch(file, metadata) {
     return isDirMatch(file, metadata) && isExtensionMatch(file, metadata)
}
function isAuthProviderMatch(file, metadata) {
    return isFileExtensionMatch(file, metadata) && isNameMatch(file, metadata)
}
function isSettingsMatch(file, metadata) {
    return isBaseMatch(file, metadata) && isNameMatch(file, metadata)
}
function isFolderMatch(file, metadata) {
    return isDirMatch(file, metadata) && !file.path.endsWith('-meta.xml') && !file.path.endsWith('unfiled$public') && fs.existsSync(file.path + '-meta.xml')
}
function isFileMatch(file, metadata) {
    return isBaseMatch(file, metadata) && isFile(file)
}
function isFileExtensionMatch(file, metadata) {
    return isFileMatch(file, metadata) && isExtensionMatch(file, metadata)
}
function isMetadataXmlMatch(file, metadata) {
    var match = utils.escape(path.sep + 'src' + path.sep + metadata.dir + path.sep + path.basename(file.path))
    return isDirMatch(file, metadata) && isMetadataExtensionMatch(file) && file.path.match(new RegExp(match))
}
function isCustomObjectMatch(file, metadata, managed) {
    return (managed || !isManagedObjectFilter(file)) && isCustomObjectFilter(file, metadata) && isFileExtensionMatch(file, metadata)
}
// ====================================================================================================
// ======================================      Filter     ===========================================
// ====================================================================================================
function unmanagedElementFilter(element) {
    return !element.text().match(/__[\s\S]*__/)
}
function isManagedObjectFilter(file) {
    return file.path.match(/__[\s\S]*__/)
}
function isCustomObjectFilter(file, metadata) {
    return (file.path.match(/__c.object$/) || file.path.match(/__mdt.object$/) || file.path.match(/__kav.object$/) || 
        file.path.match(/__e.object$/) || file.path.match(/__b.object$/)) && getXmlElements(file, metadata).length > 0
}
function customElementFilter(element, metadata) {
    var customOnlyTypes = ['CustomField']
    // Only return custom types.  Don't get Standard elements.  This means the thing ends with __c
    var idx = customOnlyTypes.indexOf(metadata.type)
    if (idx > -1) {
        return element.text().match(/__c/)
    }
    return true
}
// ====================================================================================================
// ==================================      Support Functions     ======================================
// ====================================================================================================
function merge(prev, curr, idx, arr) {
    return prev.concat(curr)
}
function getFileAndElementName(file, metadata, element) {
    return getFilename(file, metadata) + '.' + element.text()
}
function getFilename(file, metadata) {
    return utils.getFilename(file.path, metadata.extension)
}
function getAuraName(file, metadata) {
    var name = file.path.substring(0, file.path.lastIndexOf(path.sep))
    name = name.substring(name.lastIndexOf(path.sep) + 1)
    return name
}
function getFolderAndFilename(file, metadata) {
    return utils.getFolderAndFilename(file.path, metadata.extension, metadata.dir)
}
function getFolderAndFilenameWithExt(file, metadata) {
    return utils.getFolderAndFilenameWithExt(file.path, metadata.dir)
}
function getProcessName(file, metadata) {
    return getXmlElements(file, metadata)
        .map(element => getFileAndElementName(file, metadata, element))
}
function getXmlElements(file, metadata) {
    var xmlString = fs.readFileSync(file.path).toString()

    try {
        var xmlDocument = xml.parseXmlString(xmlString)
    } catch (err) {
        console.error('XML parsing error in:' + file.path)
        throw err
    }

    var elements = xmlDocument.find(metadata.options.item_xpath, 'http://soap.sforce.com/2006/04/metadata')
    return elements
}
function getFileAndElement(file, metadata, managed) {
    return getXmlElements(file, metadata)
        .filter(e => managed ? true : unmanagedElementFilter(e))
        .map(element => getFileAndElementName(file, metadata, element))
}
function getElement(file, metadata, managed) {
    return getXmlElements(file, metadata)
        .filter(e => managed ? true : unmanagedElementFilter(e))
        .map(element => element.text())
}
// ====================================================================================================
// ======================================      Parsers     ============================================
// ====================================================================================================
function AuraBundleParser(metadata, contents, managed) {
    return contents
        .filter(file => isFileMatch(file, metadata))
        .map(file => getAuraName(file, metadata))
}
function AuthProviderParser(metadata, contents, managed) {
    return contents
        .filter(file => isAuthProviderMatch(file, metadata))
        .map(file => 'AuthProvider')
}
function BaseMetadataParser(metadata, contents) {
    return contents
        .filter(file => isFileExtensionMatch(file, metadata))
        .map(file => getFilename(file, metadata))
}
function BusinessProcessParser(metadata, contents, managed) {
    return contents
        .filter(file => isFileMatch(file, metadata))
        .map(file => getProcessName(file, metadata))
        .reduce(merge, [])
}
function CustomLabelsParser(metadata, contents, managed) {
    return contents
        .filter(file => isFileMatch(file, metadata))
        .map(file => getElement(file, metadata))
        .reduce(merge, [])
}
function CustomObjectParser(metadata, contents, managed) {
    return contents
        .filter(file => isCustomObjectMatch(file, metadata, managed))
        .map(file => getFilename(file, metadata))
}
function DocumentParser(metadata, contents, managed) {
    return contents
        .filter(file => (isFileMatch(file, metadata) || isFolderMatch(file, metadata) || isMetadataXmlMatch(file, metadata)))
        .map(file => getFolderAndFilenameWithExt(file, metadata))
}
function FolderAndFilenameParser(metadata, contents, managed) {
    return contents
        .filter(file => (isBaseMatch(file, metadata) || isFolderMatch(file, metadata) || isMetadataXmlMatch(file, metadata)))
        .map(file => getFolderAndFilename(file, metadata)).sort()
}
function MetadataFilenameParser(metadata, contents, managed) {
    return contents
        .filter(file => isBaseMatch(file, metadata))
        .map(file => getFolderAndFilename(file, metadata)).sort()
}
function MetadataFolderParser(metadata, contents, managed) {
    return contents
        .filter(file => isFolderMatch(file, metadata))
        .map(file => getFolderAndFilename(file, metadata)).sort()
}
function MetadataXmlElementParser(metadata, contents, managed) {
    return contents
        .filter(file => isFileMatch(file, metadata))
        .map(file => getFileAndElement(file, metadata, managed))
        .reduce(merge, [])
}
function RecordTypeParser(metadata, contents, managed) {
    return this.MetadataXmlElementParser(metadata, contents, managed)
}
function SettingsParser(metadata, contents, managed) {
    return contents
        .filter(file => isSettingsMatch(file, metadata))
        .map(file => getFolderAndFilename(file, metadata)).sort()
}
module.exports = {
    AuraBundleParser: AuraBundleParser,
    AuthProviderParser: AuthProviderParser,
    BaseMetadataParser: BaseMetadataParser,
    BusinessProcessParser: BusinessProcessParser,
    CustomLabelsParser: CustomLabelsParser,
    CustomObjectParser: CustomObjectParser,
    DocumentParser: DocumentParser,
    FolderAndFilenameParser: FolderAndFilenameParser,
    MetadataFilenameParser: MetadataFilenameParser,
    MetadataFolderParser: MetadataFolderParser,
    MetadataXmlElementParser: MetadataXmlElementParser,
    RecordTypeParser: RecordTypeParser,
    SettingsParser: SettingsParser
}
